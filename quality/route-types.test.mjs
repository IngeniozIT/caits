import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { OUT_DIR, writeRouteTypes } from "./route-types.mjs";

/** @type {string[]} */
const folders = [];
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });

/** A project with a route, and no types of the routes, as git gives it: it uses the packages of CAITS. */
function newProject() {
  const root = mkdtempSync(join(tmpdir(), "caits-route-types-"));
  folders.push(root);
  /** @type {Record<string, string>} */
  const files = {
    "package.json": '{ "type": "module" }\n',
    "tsconfig.json": "{}\n",
    "quality/vite.config.ts": 'import marko from "@marko/run/vite";\nexport default { plugins: [marko()] };\n',
    "src/routes/_backend/api/notes/+handler.ts": "export const GET = Run.GET(() => new Response(\"notes\"));\n",
    "src/routes/_frontend/notes/+page.marko": "<h1>Notes</h1>\n"
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  symlinkSync(join(import.meta.dirname, "../node_modules"), join(root, "node_modules"));
  return root;
}

describe("the types of the routes", () => {
  test("are written in .marko-run/routes.d.ts, with the routes of the project; the build folders stay empty", async () => {
    const root = newProject();

    await writeRouteTypes(root);

    const types = readFileSync(join(root, ".marko-run/routes.d.ts"), "utf8");
    expect(types).toContain('"/api/notes"');
    expect(types).toContain('"/notes"');
    expect(existsSync(join(root, "dist"))).toBe(false);
    expect(existsSync(join(root, OUT_DIR, String(process.pid)))).toBe(false);
  }, 30_000);
});
