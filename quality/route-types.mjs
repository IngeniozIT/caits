// The types of the routes: @marko/run writes them in .marko-run/routes.d.ts each time it reads the routes (a build, a start of Vitest or
// of the development server). The lint reads them: they give the global `Run` of the handlers. Git ignores .marko-run/, so a new project
// or a new clone has no types until one of these commands runs: the ESLint configuration of CAITS (quality/caits/eslint.js) writes them
// first, with this function.
import { rmSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "vite";

export const VITE_CONFIG = "quality/vite.config.ts";

/**
 * @marko/run writes the entry files of the routes in the build folder: each run has one of its own, as `caits dev` has, which it removes
 * at its end. Two lints can run at once: one in the editor, one in the terminal.
 */
export const OUT_DIR = "node_modules/.caits/route-types";

/**
 * Writes the types of the routes of the project of `root`: starts Vite with the configuration of the project, without a server, a
 * watcher or HMR, and loads the router of @marko/run, which writes them. It takes less than a second.
 * @param {string} root
 * @returns {Promise<void>}
 */
export async function writeRouteTypes(root) {
  const outDir = join(OUT_DIR, String(process.pid));
  const vite = await createServer({
    root,
    configFile: join(root, VITE_CONFIG),
    logLevel: "error",
    appType: "custom",
    build: { outDir },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true }
  });
  try {
    await vite.environments.ssr.transformRequest("@marko/run/router");
  } finally {
    await vite.close();
    rmSync(join(root, outDir), { recursive: true, force: true });
  }
}
