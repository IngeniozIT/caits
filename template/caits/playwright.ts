import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

/** This file is in quality/caits/: the root of the project is two folders up. */
const root = join(import.meta.dirname, "../..");
const port = 4310;
const fileOf = (specifier: string) => fileURLToPath(import.meta.resolve(specifier));
/** The folder of the data of the server: one for each project, also for two projects with the same name. */
const dataDirectory = join(tmpdir(), `${basename(root)}-${createHash("sha256").update(root).digest("hex").slice(0, 8)}-e2e-data`);

/**
 * The end-to-end tests run on the production build. `caits e2e` starts the server of webServer itself, then Playwright uses it.
 * The server keeps its data in DATA_DIR, which `caits e2e` empties before it starts the server. It builds in dist/, also under
 * `caits check`, which gives each check a build folder of its own (CAITS_OUT_DIR): `npm run start` runs dist/index.mjs.
 * The port must be free: `caits e2e` refuses to run the tests on a server that runs there already.
 */
export default defineConfig({
  testDir: join(root, "test/e2e"),
  outputDir: join(root, "test-results"),
  workers: 1,
  fullyParallel: false,
  reporter: [["list"], [fileOf("@ingenioz-it/caits/quality/test-docs/playwright-reporter")]],
  use: { baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    command: "npm run build && npm run start",
    cwd: root,
    url: `http://127.0.0.1:${port}/`,
    timeout: 120_000,
    reuseExistingServer: !!process.env.E2E_REUSE_SERVER,
    env: { PORT: String(port), DATA_DIR: dataDirectory, CAITS_OUT_DIR: "" }
  }
});
