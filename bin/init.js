// JavaScript, not TypeScript: npx runs this file from node_modules, where Node strips no types. TypeScript checks the types of the comments.
import { spawnSync } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** @typedef {{ [key: string]: unknown }} PackageJson */
/** @typedef {{ [name: string]: string }} Section */
/** @typedef {{ dependencies?: Section; devDependencies?: Section }} Packages */
/** @typedef {{ key: string; project: unknown; caits: string }} KeptValue */
/** @typedef {{ written: string[]; kept: string[]; ignored: string[]; values: KeptValue[] }} Report */

/**
 * @param {URL | string} file
 * @returns {unknown}
 */
const readJson = file => JSON.parse(readFileSync(file, "utf8"));

/**
 * A package.json: its object, or an error that names the file and tells what is wrong.
 * @param {string} file
 * @returns {PackageJson}
 */
function readPackage(file) {
  const text = readFileSync(file, "utf8");
  /** @type {unknown} */
  let project;
  try {
    project = JSON.parse(text);
  } catch (error) {
    throw new Error(`${file} is not valid JSON: ${/** @type {SyntaxError} */ (error).message}`, { cause: error });
  }
  if (typeof project !== "object" || project === null || Array.isArray(project)) throw new Error(`${file} is not valid: it must hold an object.`);
  return /** @type {PackageJson} */ (project);
}

/**
 * Why a command cannot start: most often, it is not installed.
 * @param {string} command
 * @param {Error} error
 */
const notStarted = (command, error) => "code" in error && error.code === "ENOENT" ? `${command} is not installed, or is not in the PATH` : `${command} cannot start: ${error.message}`;

const OWN_PACKAGE = /** @type {{ version: string; devDependencies: Section }} */ (readJson(new URL("../package.json", import.meta.url)));

/** The version of CAITS, and where npm gets it: the npm registry, this version or a later one with the same minor version. */
export const VERSION = OWN_PACKAGE.version;
export const SOURCE = `^${VERSION}`;

/**
 * The files of the project: `init` writes them once, and never changes them after. The files of quality/ import the defaults of CAITS and
 * change them. Then comes the code: a first page (empty/), or the example.
 * npm leaves `.gitignore` out of a package: the template names the dotfiles without their dot. It names AGENTS.md without its extension:
 * an AI agent at work on CAITS would take it for the instructions of the folder template/project/.
 */
const PROJECT_FILES = fileURLToPath(new URL("../template/project/", import.meta.url));
const EMPTY = fileURLToPath(new URL("../template/empty/", import.meta.url));
/** The files of the template that the project names otherwise. */
const NAMES = new Map([["gitignore", ".gitignore"], ["nvmrc", ".nvmrc"], ["AGENTS", "AGENTS.md"]]);

/**
 * The example, a small app that shows each layer, is not in the package of CAITS: `init --example` gets it from its repository, at the
 * tag of this version, with git over HTTPS: a public repository needs no SSH key. A source is a git repository, with `#` and a tag or a
 * branch, or a folder.
 * `init` takes the files of its folders src/ and test/, and the packages of its package.json.
 */
export const EXAMPLE_SOURCE = `https://github.com/IngeniozIT/caits-example.git#v${VERSION}`;
const EXAMPLE_FOLDERS = ["src", "test"];

/** The defaults of CAITS: `init` and `update` write them in quality/caits/. CAITS owns this folder: `update` replaces it. */
const DEFAULTS = fileURLToPath(new URL("../template/caits/", import.meta.url));
export const DEFAULTS_FOLDER = "quality/caits";
/** @param {string} version */
const headerOf = version => `// CAITS ${version} wrote this file. Do not change it: \`npx caits update\` writes it again. Change the file of the project that uses it.\n`;
const HEADER = /^\/\/ CAITS (\S+) wrote this file\./;

/** What CAITS adds to the package.json of a project. The scripts run the tools with the configuration files of quality/. */
const PACKAGE = {
  type: "module",
  imports: {
    "#backend/*": "./src/backend/*",
    "#frontend/*": "./src/frontend/*"
  },
  engines: {
    node: "^22.18.0 || ^24.0.0 || >=26.0.0"
  },
  scripts: {
    dev: "caits dev",
    build: "marko-run build --config quality/vite.config.ts",
    start: "node dist/index.mjs",
    typecheck: "npm run build && mtc",
    lint: "npm run lint:code && npm run lint:architecture",
    "lint:code": "eslint --config quality/eslint.config.js .",
    "lint:architecture": "caits architecture",
    test: "vitest run --config quality/vite.config.ts",
    "test:unit": "vitest run --config quality/vite.config.ts --exclude '**/infra/**/*.test.ts' --exclude '**/*.integration.test.ts'",
    "test:contracts": "vitest run --config quality/vite.config.ts /infra/",
    "test:integration": "vitest run --config quality/vite.config.ts .integration.test.ts",
    "test:e2e": "caits e2e",
    "test:coverage": "vitest run --config quality/vite.config.ts --coverage --reporter=default --reporter=@ingenioz-it/caits/quality/test-docs/vitest-reporter",
    "test:mutation": "caits mutation",
    tdd: "vitest --config quality/vite.config.ts",
    check: "caits check typecheck lint:code lint:architecture test:coverage test:mutation test:e2e"
  }
};

/** The packages that a project needs. CAITS suggests the versions that it uses itself: those of its own devDependencies. */
const TOOLS = {
  dependencies: ["@marko/run", "marko"],
  devDependencies: [
    "@eslint/js", "@marko/compiler", "@marko/type-check", "@playwright/test", "@stryker-mutator/core", "@stryker-mutator/typescript-checker",
    "@types/node", "@vitest/coverage-v8", "eslint", "happy-dom", "sass", "typescript", "typescript-eslint", "vite", "vitest"
  ]
};
/** @param {string[]} names */
const versionsOf = names => Object.fromEntries(names.map(name => [name, OWN_PACKAGE.devDependencies[name] ?? "*"]));
export const SUGGESTED = { dependencies: versionsOf(TOOLS.dependencies), devDependencies: versionsOf(TOOLS.devDependencies) };

const DEPENDENCY_KEYS = new Set(["dependencies", "devDependencies"]);

/**
 * Makes a CAITS project in `root`, or adds CAITS to the project in it: writes the files of the project, with a first page or, with
 * `example` (its source), the example; the defaults of CAITS (quality/caits/); the folders of the contexts; and adds to package.json what
 * CAITS needs (`caits` is where npm gets CAITS), and the packages of the example. A file or a value that the project has already stays as
 * it is: the report tells it. The lines of the template that .gitignore does not have go at its end. `init` installs nothing. When it
 * cannot read the package.json of the project, or get the example, it throws, and writes nothing.
 * @param {string} root
 * @param {string} [caits]
 * @param {{ example?: string }} [options]
 * @returns {Report}
 */
export function init(root, caits = SOURCE, { example } = {}) {
  const manifest = join(root, "package.json");
  const project = existsSync(manifest) ? readPackage(manifest) : { name: nameOf(root), private: true };
  const code = example === undefined ? { folder: EMPTY, files: filesOf(EMPTY), packages: {}, remove() {} } : getExample(example);
  try {
    mkdirSync(root, { recursive: true });
    /** @type {Report} */
    const report = { written: [], kept: [], ignored: [], values: [] };
    for (const { folder, files } of [{ folder: PROJECT_FILES, files: filesOf(PROJECT_FILES) }, code]) {
      for (const file of files) {
        const path = NAMES.get(file) ?? file;
        const target = join(root, path);
        if (path === ".gitignore" && existsSync(target)) report.ignored = addMissingLines(target, readFileSync(join(folder, file), "utf8"));
        else if (existsSync(target)) report.kept.push(path);
        else {
          mkdirSync(dirname(target), { recursive: true });
          copyFileSync(join(folder, file), target);
          report.written.push(path);
        }
      }
    }
    report.written.push(...update(root));
    for (const side of ["backend", "frontend"]) mkdirSync(join(root, "src", side), { recursive: true });
    report.values = addToPackage(manifest, project, caits, code.packages);
    return report;
  } finally {
    code.remove();
  }
}

/**
 * The example of a source: its folder, the files of its folders src/ and test/, and the packages of its package.json. A git source is
 * cloned in a temporary folder: `remove` removes it, and an example that CAITS cannot read removes it at once.
 * @param {string} source
 * @returns {{ folder: string; files: string[]; packages: Packages; remove: () => void }}
 */
function getExample(source) {
  const local = existsSync(source) && statSync(source).isDirectory();
  const folder = local ? source : cloneExample(source);
  const remove = () => { if (!local) rmSync(folder, { recursive: true, force: true }); };
  try {
    if (!existsSync(join(folder, "src"))) throw new Error(`${source} is not an example of CAITS: it has no folder src/.`);
    const files = EXAMPLE_FOLDERS.filter(name => existsSync(join(folder, name))).flatMap(name => filesOf(join(folder, name)).map(file => `${name}/${file}`));
    const manifest = join(folder, "package.json");
    const project = existsSync(manifest) ? readPackage(manifest) : {};
    const packages = { dependencies: sectionOf(project, "dependencies"), devDependencies: sectionOf(project, "devDependencies") };
    return { folder, files, packages, remove };
  } catch (error) {
    remove();
    throw error;
  }
}

/**
 * Clones a git source (a repository, then `#` and a tag or a branch) in a temporary folder, without its history. Gives the folder.
 * @param {string} source
 * @returns {string}
 */
function cloneExample(source) {
  const hash = source.lastIndexOf("#");
  const [repository, ref] = hash === -1 ? [source, undefined] : [source.slice(0, hash), source.slice(hash + 1)];
  const folder = mkdtempSync(join(tmpdir(), "caits-example-"));
  const args = ["clone", "--quiet", "--depth", "1", ...(ref ? ["--branch", ref] : []), "--", repository, folder];
  const result = spawnSync("git", args, { encoding: "utf8", stdio: ["ignore", "ignore", "pipe"] });
  if (result.status !== 0) {
    rmSync(folder, { recursive: true, force: true });
    if (result.error) throw new Error(`${notStarted("git", result.error)}: init needs it to get the example from ${source}.`);
    throw new Error(`git cannot get the example from ${source}:\n${result.stderr}`);
  }
  return folder;
}

/**
 * Writes the defaults of this version of CAITS in quality/caits/, in place of those that are there. Gives the files written.
 * @param {string} root
 * @returns {string[]}
 */
export function update(root) {
  const folder = join(root, DEFAULTS_FOLDER);
  rmSync(folder, { recursive: true, force: true });
  mkdirSync(folder, { recursive: true });
  return filesOf(DEFAULTS).map(file => {
    writeFileSync(join(folder, file), headerOf(VERSION) + readFileSync(join(DEFAULTS, file), "utf8"));
    return `${DEFAULTS_FOLDER}/${file}`;
  });
}

/**
 * The versions of CAITS that wrote the files of quality/caits/: one version when they come from one update, none when there is no file.
 * @param {string} root
 * @returns {string[]}
 */
export function defaultsVersions(root) {
  const folder = join(root, DEFAULTS_FOLDER);
  if (!existsSync(folder)) return [];
  const versions = filesOf(folder).map(file => HEADER.exec(readFileSync(join(folder, file), "utf8"))?.[1] ?? "unknown");
  return [...new Set(versions)];
}

/**
 * The packages whose version in package.json is not the one that CAITS suggests. CAITS does not change them: the project chooses.
 * @param {string} root
 * @returns {KeptValue[]}
 */
export function otherVersions(root) {
  const file = join(root, "package.json");
  if (!existsSync(file)) return [];
  const project = readPackage(file);
  return Object.values(SUGGESTED).flatMap(section => Object.entries(section).flatMap(([name, caits]) => {
    const current = dependencyOf(project, name);
    return current !== undefined && current !== caits ? [{ key: name, project: current, caits }] : [];
  }));
}

/**
 * Installs the packages of package.json, then the browser of the end-to-end tests. Gives false when a command fails.
 * @param {string} root
 * @returns {boolean}
 */
export function install(root) {
  return run("npm", ["install"], root) && run("npx", ["playwright", "install", "chromium"], root);
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {string} cwd
 */
function run(command, args, cwd) {
  console.log(`\n> ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) console.error(`${notStarted(command, result.error)}.`);
  return result.status === 0;
}

/**
 * The files of a folder and of its sub-folders, from the folder, with "/" on every system. A symbolic link stops the reading: a link in
 * an example could copy any file of the computer into the project.
 * @param {string} folder
 * @returns {string[]}
 */
function filesOf(folder) {
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter(entry => {
      if (entry.isSymbolicLink()) throw new Error(`${join(entry.parentPath, entry.name)} is a symbolic link: CAITS copies no link. Remove it, or put the file in its place.`);
      return entry.isFile();
    })
    .map(entry => relative(folder, join(entry.parentPath, entry.name)).split(sep).join("/"))
    .sort();
}

/**
 * Adds at the end of a file the lines of `text` that it does not have, comments and empty lines aside. Gives the added lines.
 * @param {string} file
 * @param {string} text
 * @returns {string[]}
 */
function addMissingLines(file, text) {
  const present = new Set(readFileSync(file, "utf8").split("\n").map(line => line.trim()));
  const missing = text.split("\n").map(line => line.trim()).filter(line => line !== "" && !line.startsWith("#") && !present.has(line));
  if (missing.length > 0) appendFileSync(file, `\n# CAITS\n${missing.join("\n")}\n`);
  return missing;
}

/**
 * Adds to a package.json (written when the project has none) the values that CAITS needs and that it does not have, and the packages
 * with the versions that CAITS suggests, then those of the example. A package is present when the dependencies or the devDependencies
 * name it. Gives the values that the project has already, and that differ.
 * @param {string} file
 * @param {PackageJson} project the values of the file, or those of a new project
 * @param {string} caits
 * @param {Packages} example
 * @returns {KeptValue[]}
 */
function addToPackage(file, project, caits, example) {
  const dependencies = { ...SUGGESTED.dependencies, ...example.dependencies };
  const devDependencies = { "@ingenioz-it/caits": caits, ...SUGGESTED.devDependencies, ...example.devDependencies };
  const wanted = { ...PACKAGE, dependencies, devDependencies };
  /** @type {KeptValue[]} */
  const kept = [];
  for (const [key, value] of Object.entries(wanted)) {
    const present = project[key];
    if (typeof value === "string") {
      if (present === undefined) project[key] = value;
      else if (present !== value) kept.push({ key, project: present, caits: value });
      continue;
    }
    for (const [name, item] of Object.entries(value)) {
      const current = DEPENDENCY_KEYS.has(key) ? dependencyOf(project, name) : sectionOf(project, key)?.[name];
      if (current === undefined) project[key] = { ...sectionOf(project, key), [name]: item };
      else if (current !== item) kept.push({ key: `${key}.${name}`, project: current, caits: item });
    }
  }
  for (const key of DEPENDENCY_KEYS) {
    const section = sectionOf(project, key);
    if (section) project[key] = Object.fromEntries(Object.entries(section).sort(([a], [b]) => a.localeCompare(b)));
  }
  writeFileSync(file, `${JSON.stringify(project, null, 2)}\n`);
  return kept;
}

/**
 * @param {PackageJson} project
 * @param {string} key
 * @returns {Section | undefined}
 */
function sectionOf(project, key) {
  const section = project[key];
  return typeof section === "object" && section !== null ? /** @type {Section} */ (section) : undefined;
}

/**
 * The version of a package in the dependencies or the devDependencies of a project.
 * @param {PackageJson} project
 * @param {string} name
 */
function dependencyOf(project, name) {
  return sectionOf(project, "dependencies")?.[name] ?? sectionOf(project, "devDependencies")?.[name];
}

/**
 * The name of a new package: the name of its folder, as npm accepts it.
 * @param {string} folder
 */
function nameOf(folder) {
  return basename(folder).toLowerCase().replace(/[^a-z0-9._~-]+/g, "-").replace(/^[._-]+/, "") || "app";
}
