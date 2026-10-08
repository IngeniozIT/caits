import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { defaultsVersions, EXAMPLE_SOURCE, init, otherVersions, SUGGESTED, update, VERSION } from "./init.js";

type PackageJson = { name: string; private: boolean; type: string; scripts: Record<string, string>; dependencies: Record<string, string>; devDependencies: Record<string, string> };

const folders: string[] = [];
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });

function newFolder(): string {
  const folder = mkdtempSync(join(tmpdir(), "caits-init-"));
  folders.push(folder);
  return folder;
}

const read = (root: string, path: string) => readFileSync(join(root, path), "utf8");
const write = (root: string, path: string, text: string) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
};
const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "user.name=CAITS", "-c", "user.email=caits@example.com", ...args], { cwd, stdio: "ignore" });
const packageOf = (root: string) => JSON.parse(read(root, "package.json")) as PackageJson;
/** An example with a page, an end-to-end test, its packages, and a file that stays in its repository. */
function newExample(page = "<h1>Example</h1>"): string {
  const example = newFolder();
  write(example, "src/routes/_frontend/+page.marko", page);
  write(example, "test/e2e/example.spec.ts", "// the example\n");
  write(example, "package.json", JSON.stringify({ name: "caits-example", dependencies: { "a-font": "^1.0.0" }, devDependencies: { "a-tool": "^2.0.0" } }));
  write(example, "README.md", "# The example\n");
  return example;
}

const DEFAULTS = ["architecture.mjs", "eslint.js", "marko-modules.d.ts", "playwright.ts", "stryker.mjs", "tsconfig.json", "tsconfig.mutation.json", "vite.ts"].map(file => `quality/caits/${file}`);

describe("init", () => {
  test("makes a project in a new folder: the files of the project (AGENTS.md for the AI agents), the defaults of CAITS, the folders of the contexts and package.json", () => {
    const root = join(newFolder(), "My App");

    const report = init(root, "github:owner/caits#v9");

    expect(report.written).toEqual(expect.arrayContaining([
      ".gitignore", ".nvmrc", "AGENTS.md", "tsconfig.json", "quality/architecture.mjs", "quality/eslint.config.js", "quality/vite.config.ts", "src/routes/_frontend/+page.marko", "test/e2e/home.spec.ts", ...DEFAULTS
    ]));
    expect(report).toMatchObject({ kept: [], ignored: [], values: [] });
    expect(existsSync(join(root, "src/backend"))).toBe(true);
    expect(existsSync(join(root, "src/frontend"))).toBe(true);
    expect(packageOf(root)).toMatchObject({
      name: "my-app",
      private: true,
      type: "module",
      scripts: { check: "caits check typecheck lint:code lint:architecture test:coverage test:mutation test:e2e" },
      dependencies: { marko: SUGGESTED.dependencies.marko },
      devDependencies: { "@ingeniozit/caits": "github:owner/caits#v9", sass: SUGGESTED.devDependencies.sass, typescript: SUGGESTED.devDependencies.typescript }
    });
  });

  test("with the example, writes its src/ and test/ in place of the first page, and adds its packages", () => {
    const root = newFolder();

    const { written } = init(root, "caits", { example: newExample() });

    expect(written).toEqual(expect.arrayContaining(["src/routes/_frontend/+page.marko", "test/e2e/example.spec.ts", "quality/architecture.mjs", ...DEFAULTS]));
    expect(written).not.toContain("test/e2e/home.spec.ts");
    expect(written).not.toContain("README.md");
    expect(read(root, "src/routes/_frontend/+page.marko")).toBe("<h1>Example</h1>");
    expect(packageOf(root)).toMatchObject({
      dependencies: { "a-font": "^1.0.0", marko: SUGGESTED.dependencies.marko },
      devDependencies: { "a-tool": "^2.0.0", typescript: SUGGESTED.devDependencies.typescript }
    });
  });

  test("gets the example of a git repository at a tag, and removes its clone", () => {
    const repository = newExample("<h1>Tagged</h1>");
    git(repository, "init", "--quiet");
    git(repository, "add", ".");
    git(repository, "commit", "--quiet", "-m", "the example");
    git(repository, "tag", "v1");
    write(repository, "src/routes/_frontend/+page.marko", "<h1>After the tag</h1>");
    git(repository, "commit", "--quiet", "-am", "after the tag");
    const root = newFolder();
    const clones = () => readdirSync(tmpdir()).filter(name => name.startsWith("caits-example-"));
    const before = clones();

    const { written } = init(root, "caits", { example: `file://${repository}#v1` });

    expect(read(root, "src/routes/_frontend/+page.marko")).toBe("<h1>Tagged</h1>");
    expect(clones()).toEqual(before);
    expect(written.filter(path => path.startsWith(".git/"))).toEqual([]);
    expect(packageOf(root).dependencies).toMatchObject({ "a-font": "^1.0.0" });
  });

  test("without the example, writes nothing: a source that git cannot get, or a folder without src/", () => {
    const root = join(newFolder(), "app");

    expect(() => init(root, "caits", { example: `file://${join(newFolder(), "none")}#v1` })).toThrow(/^git cannot get the example from file:.*#v1:\n./s);
    expect(() => init(root, "caits", { example: newFolder() })).toThrow(/is not an example of CAITS: it has no folder src\//);
    expect(existsSync(root)).toBe(false);
  });

  test("gets the example of the tag of this version of CAITS", () => {
    expect(EXAMPLE_SOURCE).toBe(`git@github.com:IngeniozIT/caits-example.git#v${VERSION}`);
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
