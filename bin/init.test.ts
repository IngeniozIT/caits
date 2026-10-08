import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { defaultsVersions, init, otherVersions, SUGGESTED, update, VERSION } from "./init.js";

type PackageJson = { name: string; private: boolean; type: string; scripts: Record<string, string>; dependencies: Record<string, string>; devDependencies: Record<string, string> };

const folders: string[] = [];
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });

function newFolder(): string {
  const folder = mkdtempSync(join(tmpdir(), "caits-init-"));
  folders.push(folder);
  return folder;
}

const read = (root: string, path: string) => readFileSync(join(root, path), "utf8");
const write = (root: string, path: string, text: string) => writeFileSync(join(root, path), text);
const packageOf = (root: string) => JSON.parse(read(root, "package.json")) as PackageJson;
const DEFAULTS = ["architecture.mjs", "eslint.js", "marko-modules.d.ts", "playwright.ts", "stryker.mjs", "tsconfig.json", "tsconfig.mutation.json", "vite.ts"].map(file => `quality/caits/${file}`);

describe("init", () => {
  test("makes a project in a new folder: the files of the project, the defaults of CAITS, the folders of the contexts and package.json", () => {
    const root = join(newFolder(), "My App");

    const report = init(root, "github:owner/caits#v9");

    expect(report.written).toEqual(expect.arrayContaining([
      ".gitignore", ".nvmrc", "tsconfig.json", "quality/architecture.mjs", "quality/eslint.config.js", "quality/vite.config.ts", "src/routes/_frontend/+page.marko", "test/e2e/home.spec.ts", ...DEFAULTS
    ]));
    expect(report).toMatchObject({ kept: [], ignored: [], values: [] });
    expect(existsSync(join(root, "src/backend"))).toBe(true);
    expect(existsSync(join(root, "src/frontend"))).toBe(true);
    expect(packageOf(root)).toMatchObject({
      name: "my-app",
      private: true,
      type: "module",
      scripts: { check: "npm run typecheck && npm run lint && npm test && npm run test:e2e" },
      dependencies: { marko: SUGGESTED.dependencies.marko },
      devDependencies: { "@ingeniozit/caits": "github:owner/caits#v9", typescript: SUGGESTED.devDependencies.typescript }
    });
  });

  test("with the example, writes a small app in place of the first page", () => {
    const root = newFolder();

    const { written } = init(root, "caits", { example: true });

    expect(written).toEqual(expect.arrayContaining([
      "src/routes/_frontend/+layout.marko", "src/routes/_frontend/+page.marko", "src/routes/_frontend/messages/+page.marko",
      "src/routes/_backend/api/messages/+handler.ts", "src/routes/_backend/api/messages/$id/+handler.ts",
      "src/backend/messages/di.ts", "src/backend/messages/package.json", "src/frontend/messages/di.ts", "test/e2e/messages.spec.ts", ...DEFAULTS
    ]));
    expect(written).not.toContain("test/e2e/home.spec.ts");
    expect(read(root, "src/routes/_frontend/+page.marko")).toContain("<h1>Home</h1>");
  });

  test("adds CAITS to a project: keeps its files and its values, and tells which ones differ", () => {
    const root = newFolder();
    write(root, "package.json", JSON.stringify({ name: "old", type: "commonjs", scripts: { test: "jest", other: "x" }, devDependencies: { marko: "^5.0.0" } }));
    write(root, "tsconfig.json", "{}");
    write(root, ".gitignore", "node_modules/\nmine/\n");

    const report = init(root, "caits");

    expect(report.kept).toEqual(["tsconfig.json"]);
    expect(read(root, "tsconfig.json")).toBe("{}");
    expect(report.ignored).toContain("dist/");
    expect(report.ignored).not.toContain("node_modules/");
    expect(read(root, ".gitignore")).toMatch(/^node_modules\/\nmine\/\n\n# CAITS\ndist\/\n/);
    expect(report.values).toEqual([
      { key: "type", project: "commonjs", caits: "module" },
      { key: "scripts.test", project: "jest", caits: "vitest run --config quality/vite.config.ts" },
      { key: "dependencies.marko", project: "^5.0.0", caits: SUGGESTED.dependencies.marko }
    ]);
    const written = packageOf(root);
    expect(written).toMatchObject({ name: "old", type: "commonjs", scripts: { test: "jest", other: "x", dev: "caits dev" } });
    expect(written.dependencies).toEqual({ "@marko/run": SUGGESTED.dependencies["@marko/run"] });
    expect(written.devDependencies.marko).toBe("^5.0.0");
  });

  test("a second run changes no file of the project, and writes the defaults again", () => {
    const root = newFolder();
    init(root, "caits");
    write(root, "quality/eslint.config.js", "export default [];\n");
    const before = read(root, "package.json");

    const report = init(root, "caits");

    expect(report).toMatchObject({ written: DEFAULTS, ignored: [], values: [] });
    expect(read(root, "quality/eslint.config.js")).toBe("export default [];\n");
    expect(read(root, "package.json")).toBe(before);
  });
});

describe("update", () => {
  test("replaces quality/caits/ with the defaults of the installed CAITS, each marked with its version", () => {
    const root = newFolder();
    init(root, "caits");
    write(root, "quality/caits/eslint.js", "changed by hand\n");
    write(root, "quality/caits/old.js", "a default that CAITS no longer gives\n");

    expect(update(root)).toEqual(DEFAULTS);

    expect(read(root, "quality/caits/eslint.js")).toMatch(new RegExp(`^// CAITS ${VERSION} wrote this file\\. Do not change it`));
    expect(existsSync(join(root, "quality/caits/old.js"))).toBe(false);
  });

  test("the versions of the defaults tell whether quality/caits/ comes from the installed CAITS", () => {
    const root = newFolder();
    expect(defaultsVersions(root)).toEqual([]);

    update(root);
    expect(defaultsVersions(root)).toEqual([VERSION]);

    write(root, "quality/caits/vite.ts", read(root, "quality/caits/vite.ts").replace(`CAITS ${VERSION}`, "CAITS 0.0.1"));
    expect(defaultsVersions(root)).toEqual(expect.arrayContaining([VERSION, "0.0.1"]));
  });

  test("tells which packages of the project have another version than the one that CAITS suggests, and changes none", () => {
    const root = newFolder();
    write(root, "package.json", JSON.stringify({ dependencies: { marko: SUGGESTED.dependencies.marko }, devDependencies: { vitest: "^4.0.0", other: "^1.0.0" } }));

    expect(otherVersions(root)).toEqual([{ key: "vitest", project: "^4.0.0", caits: SUGGESTED.devDependencies.vitest }]);
  });
});
