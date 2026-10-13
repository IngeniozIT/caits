import { existsSync, readFileSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";

/** What the rules know of the project: where a file lives, what it imports, and how the parts are named. */

/** @import { Facts } from "./facts.mjs" */
/** @typedef {"backend" | "frontend"} Side */
/**
 * Where a file lives: see locate. Only a layer has a context and a layer, and only a layer and the routes have a side.
 * @typedef {{ kind: "other" | "test-environment"; side?: undefined; context?: undefined; layer?: undefined }
 *   | { kind: "routes"; side: Side; context?: undefined; layer?: undefined }
 *   | { kind: "layer"; side: Side; context: string; layer: string }} Location
 */
/** A file of the project: its path from the root of the project, and what the rules read in it. @typedef {Facts & { path: string }} File */
/** The project: its root, its files, and their paths. @typedef {{ root: string; files: File[]; paths: Set<string> }} Project */
/**
 * An import of the production code: its file, where the file and its target live, the specifier, and the target (a path from the root of
 * the project when the import is internal, else the specifier).
 * @typedef {{ file: File; from: Location; to: Location; specifier: string; internal: boolean; target: string }} Import
 */
/** What a check gives: nothing, or false, when the rule holds; else a message, or a list of messages. @typedef {string | string[] | false | null | undefined | void} Messages */
/**
 * A rule of the architecture: see the rules of CAITS (quality/caits/architecture.mjs). A rule can keep values of its own, which its check
 * reads with `this`: a project can change them.
 * @typedef {{ name: string; description: string; [value: string]: unknown } & (
 *   | { on: "import"; check(link: Import): Messages }
 *   | { on: "file"; production?: boolean; check(file: File, project: Project): Messages }
 *   | { on: "project"; check(project: Project): { file: string; message: string }[] }
 * )} Rule
 */

/** The kernel is a package: the app imports it by its name, and it holds no file of the project. */
export const KERNEL = { name: "@ingenioz-it/caits" };

/**
 * The path of an import in the kernel, without the name of the kernel (`di/Container`), or null for an import of something else.
 * @type {(specifier: string) => string | null}
 */
export const kernelPathOf = specifier => specifier.startsWith(`${KERNEL.name}/`) ? specifier.slice(KERNEL.name.length + 1) : null;

/**
 * Where a file lives: a test environment (test.di.ts), the routes of one side, the context map, a layer of a context (its di.ts is a
 * layer too), or elsewhere.
 * @param {string} path
 * @returns {Location}
 */
export function locate(path) {
  const parts = path.split("/");
  if (parts[0] !== "src") return { kind: "other" };
  if (parts[1] === "routes") return { kind: "routes", side: parts[2] === "_frontend" ? "frontend" : "backend" };

  if (/^test\.di\.(js|ts)$/.test(parts[parts.length - 1])) return { kind: "test-environment" };
  if ((parts[1] === "backend" || parts[1] === "frontend") && parts.length === 4 && /^context-map(\.test)?\.(js|ts)$/.test(parts[3])) {
    return { kind: "layer", context: parts[2], side: parts[1], layer: "map" };
  }
  if ((parts[1] === "backend" || parts[1] === "frontend") && parts.length === 4) return { kind: "layer", context: parts[2], side: parts[1], layer: "di" };
  if (parts[1] === "backend" || parts[1] === "frontend") return { kind: "layer", context: parts[2], side: parts[1], layer: parts[3] };
  return { kind: "other" };
}

/** The domain and the application: the code that holds no technology. @type {(where: Location) => boolean} */
export const isCore = where => where.kind === "layer" && (where.layer === "domain" || where.layer === "application");

/** Tests, contracts, test environments (test.di.ts) and test/. @type {(path: string) => boolean} */
export const isTestCode = path => /\.(test|contract)\.ts$|(^|\/)test\.di\.ts$/.test(path) || path.startsWith("test/");

/**
 * The shortcuts of the imports, to the folders they lead to. #context leads to the context of the file: each context has a package.json
 * that says it. #shared leads to the backend context shared, and #frontend-shared to the frontend context shared: tsconfig.json says it
 * to TypeScript, and the kernel's plugin to Vite. #backend and #frontend lead to the sides, for the routes: the package.json of the
 * project says it.
 */
const SHORTCUTS = new Map([
  ["shared", "src/backend/shared"], ["frontend-shared", "src/frontend/shared"], ["backend", "src/backend"], ["frontend", "src/frontend"]
]);

/** The folder of the tags of the components of the frontend context shared, as the marko.json of the frontend gives it. */
const SHARED_TAGS = "shared/presentation/component";

/**
 * Whether src/frontend/marko.json gives Marko the folder of the components of the frontend context shared as a folder of tags
 * ("tags-dir": "./shared/presentation/component", alone or among others).
 * @param {string} root
 * @returns {boolean}
 */
export function givesSharedTags(root) {
  const file = join(root, "src/frontend/marko.json");
  if (!existsSync(file)) return false;
  /** @type {unknown} */
  const read = JSON.parse(readFileSync(file, "utf8"));
  const taglib = /** @type {{ "tags-dir"?: string | string[] }} */ (read);
  return [taglib["tags-dir"] ?? []].flat().some(folder => posix.normalize(folder).replace(/\/$/, "") === SHARED_TAGS);
}

/** The folder of the context that holds a file (src/backend/notes), or undefined. @type {(path: string) => string | undefined} */
const contextFolderOf = path => /^src\/(backend|frontend)\/[^/]+(?=\/)/.exec(path)?.[0];

/**
 * An import names a package (the kernel is one), or a file of the project: its target is then the path from the root of the project.
 * So is a shortcut: `#context/domain/entity/Note.js`, in src/backend/notes, is src/backend/notes/domain/entity/Note.js.
 * So is a path from the root of the project (`/src/…`): Vite reads it, and the reading of a stylesheet gives one for a load path.
 * @param {string} from the path of the file that imports, from the root of the project
 * @param {string} specifier
 * @param {string} root
 * @returns {{ internal: boolean; target: string }}
 */
export function resolveImport(from, specifier, root) {
  const [, shortcut, rest] = /^#([^/]+)\/(.*)$/.exec(specifier) ?? [];
  const folder = shortcut === "context" ? contextFolderOf(from) : SHORTCUTS.get(shortcut);
  if (folder) return { internal: true, target: posix.normalize(`${folder}/${rest}`) };
  if (specifier.startsWith("/")) return { internal: true, target: posix.normalize(specifier.slice(1)) };
  if (!specifier.startsWith(".")) return { internal: false, target: specifier };
  const absolute = resolve(root, dirname(from), specifier);
  return { internal: true, target: relative(root, absolute).replaceAll("\\", "/") };
}

/** The files of the project that a file imports, without their extension. @type {(file: File, root: string) => string[]} */
export const importedModules = (file, root) => file.imports
  .map(specifier => resolveImport(file.path, specifier, root))
  .filter(({ internal }) => internal)
  .map(({ target }) => target.replace(/\.(js|ts)$/, ""));

/** A class that a file names: its name, and its module (the file of the project without its extension, or the specifier of a package). @typedef {{ name: string; module: string }} Named */
/**
 * A line of a context map: whether it shares (share) or hears (when), the event that starts it, and the classes that it builds, as the
 * file imports them. A name that the file does not import has no module: the line names a class of its own file.
 * @typedef {{ shares: boolean; source: string; event: Named | null; gives: Named[] }} MapLine
 */

/**
 * The lines of a context map, `export default [when(Event, …), share(Event, …)]`, in their order. Its other items are left aside.
 * @param {File} file
 * @param {string} root
 * @returns {MapLine[]}
 */
export function linesOf(file, root) {
  /** @type {(name: string | null) => Named | null} */
  const named = name => {
    const imported = file.imported.find(entry => entry.name === name);
    if (!name || !imported) return null;
    const { internal, target } = resolveImport(file.path, imported.from, root);
    return { name, module: internal ? target.replace(/\.(js|ts)$/, "") : target };
  };
  return (file.defaultArray ?? [])
    .filter(({ chain }) => chain.length === 1 && (chain[0] === "when" || chain[0] === "share"))
    .map(({ chain: [call], source, subject, constructed }) => ({
      shares: call === "share",
      source,
      event: named(subject),
      gives: constructed.map(named).filter(/** @returns {given is Named} */ given => given !== null)
    }));
}

/** @type {(specifier: string, ...names: string[]) => boolean} */
export const isPackage = (specifier, ...names) => names.some(name => specifier === name || specifier.startsWith(`${name}/`));
/** @type {(specifier: string) => boolean} */
export const isMarko = specifier => isPackage(specifier, "marko", "@marko/run", "@marko/vite") || specifier.endsWith(".marko");
/** @type {(specifier: string) => boolean} */
export const isNode = specifier => specifier.startsWith("node:");

/**
 * A port, or its contract: {context}/domain/port/{folder}/{Port}.ts or {Port}.contract.ts. Its module is its path without the extension.
 * @param {string} path
 * @returns {{ folder: string; name: string; contract: boolean; module: string } | null}
 */
export function portOf(path) {
  const match = /^(src\/(?:backend|frontend)\/[^/]+)\/domain\/port\/([a-z0-9-]+)\/([A-Z]\w*?)(\.contract)?\.ts$/.exec(path);
  if (!match) return null;
  const [, context, folder, name, contract] = match;
  return { folder, name, contract: Boolean(contract), module: `${context}/domain/port/${folder}/${name}` };
}

/**
 * An adapter, or its test: {context}/infra/{folder}/{file}. It implements the port named after its folder.
 * @param {string} path
 * @returns {{ folder: string; test: boolean; port: string; portModule: string } | null}
 */
export function adapterOf(path) {
  const match = /^(src\/(?:backend|frontend)\/[^/]+)\/infra\/([a-z0-9-]+)\/([^/]+)$/.exec(path);
  if (!match) return null;
  const [, context, folder, name] = match;
  const port = pascal(folder);
  return { folder, test: name.endsWith(".test.ts"), port, portModule: `${context}/domain/port/${folder}/${port}` };
}

/** The contexts whose frontend a file takes: `frontendOf($global, "notes")` takes the frontend of notes. @type {(file: File) => string[]} */
export const frontendsOf = file => file.calls.flatMap(({ name, args: [, context] }) => name === "frontendOf" && typeof context === "string" ? [context] : []);

/** @type {(name: string) => string} */
export const kebab = name => name.replace(/(?<!^)([A-Z])/g, "-$1").toLowerCase();
/** @type {(kebab: string) => string} */
export const pascal = kebab => kebab.split("-").map(word => word[0].toUpperCase() + word.slice(1)).join("");

/**
 * The type of a frontend event, which the store reads: the context, then the name of the event without the context, in kebab-case.
 * @param {string} context
 * @param {string} name
 */
export function typeOfEvent(context, name) {
  const plural = pascal(context);
  const singular = plural.replace(/s$/, "");
  const rest = name.startsWith(plural) ? name.slice(plural.length) : name.startsWith(singular) ? name.slice(singular.length) : name;
  return `${context}.${kebab(rest)}`;
}
