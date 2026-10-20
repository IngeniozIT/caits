import { existsSync, readFileSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";

/** What the rules know of the project: where a file lives, what it imports, and how the parts are named. */

/** @import { Facts } from "./facts.mjs" */
/** @typedef {"backend" | "frontend"} Side */
/**
 * Where a file lives: see locate. Only a layer has a context and a layer, and only a layer and the routes have a side. A file of a use
 * case has its use case too: command/add-note.
 * @typedef {{ kind: "other" | "test-environment"; side?: undefined; context?: undefined; layer?: undefined; useCase?: undefined }
 *   | { kind: "routes"; side: Side; context?: undefined; layer?: undefined; useCase?: undefined }
 *   | { kind: "layer"; side: Side; context: string; layer: string; useCase?: string }} Location
 */
/** A file of the project: its path from the root of the project, and what the rules read in it. @typedef {Facts & { path: string }} File */
/**
 * The packages that each layer may import, by the key of its list (see LISTS): a package (`uuid`), a module (`@ingenioz-it/caits/Token`), a
 * Node API (`node:crypto`), or a folder of modules (`@ingenioz-it/caits/messaging/*`). A layer without a list imports any package.
 * @typedef {Partial<Record<"domain" | "application" | "presentation" | "infra" | "di" | "contextMap", string[]>>} Packages
 */
/**
 * The project: its root, its files, their paths, and the packages that each layer may import (quality/imports.mjs).
 * @typedef {{ root: string; files: File[]; paths: Set<string>; packages: Packages }} Project
 */
/**
 * An import of the production code: its file, where the file and its target live, the specifier, the target (a path from the root of the
 * project when the import is internal, else the specifier), and the line of the import.
 * @typedef {{ file: File; from: Location; to: Location; specifier: string; internal: boolean; target: string; line: number }} Import
 */
/** A message, at a line of the file: the rule points at one construct (an import, a class, a call…). @typedef {{ line?: number; message: string }} Located */
/**
 * What a check gives: nothing, or false, when the rule holds; else a message, or a list of messages. A message is a text, or a text with
 * its line. The message of a rule on the imports is at the line of the import, unless it gives another.
 * @typedef {string | Located | (string | Located)[] | false | null | undefined | void} Messages
 */
/**
 * A rule of the architecture: see the rules of CAITS (quality/caits/architecture.mjs). A rule can keep values of its own, which its check
 * reads with `this`: a project can change them.
 * @typedef {{ name: string; description: string; [value: string]: unknown } & (
 *   | { on: "import"; check(link: Import, project: Project): Messages }
 *   | { on: "file"; production?: boolean; check(file: File, project: Project): Messages }
 *   | { on: "project"; check(project: Project): { file: string; line?: number; message: string }[] }
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
 * layer too), or elsewhere. The folders of a context say its layers: a use case, in command/ or query/, is of the application, but its
 * controllers ({usecase}.{name}.controller.ts) and their tests ({usecase}.{name}.presentation.test.ts), which are of the presentation;
 * the events of the frontend, in event/, are of the application.
 * @param {string} path
 * @returns {Location}
 */
export function locate(path) {
  const parts = path.split("/");
  if (parts[0] !== "src") return { kind: "other" };
  if (parts[1] === "routes") return { kind: "routes", side: parts[2] === "_frontend" ? "frontend" : "backend" };

  if (/^test\.di\.(js|ts)$/.test(parts[parts.length - 1])) return { kind: "test-environment" };
  if (parts[1] !== "backend" && parts[1] !== "frontend") return { kind: "other" };
  const [, side, context, folder] = parts;
  if (parts.length === 4) return { kind: "layer", context, side, layer: /^context-map(\.test)?\.(js|ts)$/.test(folder) ? "map" : "di" };
  if ((folder === "command" || folder === "query") && parts.length === 6) {
    const layer = /\.(controller|presentation\.test)\.(js|ts)$/.test(parts[5]) ? "presentation" : "application";
    return { kind: "layer", context, side, layer, useCase: `${folder}/${parts[4]}` };
  }
  return { kind: "layer", context, side, layer: ["command", "query", "event"].includes(folder) ? "application" : folder };
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
export const contextFolderOf = path => /^src\/(backend|frontend)\/[^/]+(?=\/)/.exec(path)?.[0];

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
 * A line of a context map: whether it shares (share) or hears (when), the event that starts it, the classes that it builds, as the
 * file imports them, and its line in the file. A name that the file does not import has no module: the line names a class of its own file.
 * @typedef {{ shares: boolean; source: string; event: Named | null; gives: Named[]; line: number }} MapLine
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
    .map(({ chain: [call], source, subject, constructed, line }) => ({
      shares: call === "share",
      source,
      event: named(subject),
      gives: constructed.map(named).filter(/** @returns {given is Named} */ given => given !== null),
      line
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
 * An adapter, or its test: {context}/infra/{folder}/{file}. Its port is in the folder of the same name in the domain, domain/port/{folder}/:
 * the module of that folder that is not its contract, whatever its name. The module is null when the domain has no such port.
 * @param {string} path
 * @param {Set<string>} paths
 * @returns {{ folder: string; test: boolean; portModule: string | null } | null}
 */
export function adapterOf(path, paths) {
  const match = /^(src\/(?:backend|frontend)\/[^/]+)\/infra\/([a-z0-9-]+)\/([^/]+)$/.exec(path);
  if (!match) return null;
  const [, context, folder, name] = match;
  const port = [...paths].sort().map(portOf).find(found => found !== null && !found.contract && found.module.startsWith(`${context}/domain/port/${folder}/`));
  return { folder, test: name.endsWith(".test.ts"), portModule: port?.module ?? null };
}

/** The contexts whose frontend a file takes: `frontendOf($global, "notes")` takes the frontend of notes. @type {(file: File) => string[]} */
export const frontendsOf = file => frontendCallsOf(file).map(({ context }) => context);
/** Each call of a file that takes a frontend: its context, and its line. @type {(file: File) => { context: string; line: number }[]} */
export const frontendCallsOf = file => file.calls.flatMap(({ name, args: [, context], line }) => name === "frontendOf" && typeof context === "string" ? [{ context, line }] : []);

/**
 * The key of the list of each layer in quality/imports.mjs. The layers of a context have one each; the routes and the files out of the
 * contexts have none.
 * @type {Record<string, keyof Packages>}
 */
export const LISTS = { domain: "domain", application: "application", presentation: "presentation", infra: "infra", di: "di", map: "contextMap" };

/**
 * Whether a list of quality/imports.mjs holds an import of a package: the package, the module or the Node API itself, or a folder of
 * modules that holds it (`@ingenioz-it/caits/messaging/*` holds `@ingenioz-it/caits/messaging/EventPublisher`).
 * @param {string} specifier
 * @param {string[]} list
 */
export const isListed = (specifier, list) => list.some(entry => entry.endsWith("/*") ? specifier.startsWith(entry.slice(0, -1)) : specifier === entry);

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
