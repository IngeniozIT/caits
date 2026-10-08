// JavaScript, not TypeScript: Node loads this file itself when Vite loads its configuration, and Node strips no types in node_modules,
// where a project installs the kernel. TypeScript checks the types of the comments; vite.types.d.ts gives them to the projects.
import { promises as files } from "node:fs";
import MagicString from "magic-string";
import { normalizePath, parseSync } from "vite";
import { declareDependencies } from "./di/declareDependencies.js";

/** @import { Plugin } from "vite" */
/** @import { KernelOptions } from "./vite.types.js" */

/** The name of this package: the app imports the tokens of the kernel (EventPublisher, DataDirectory, Fetcher…) with it. */
const KERNEL = "@ingeniozit/caits";

/** The folder of the kernel: its classes and its tokens need the same code (a Controller gets its MessageBus, a token its name). */
const OWN_FOLDER = `${normalizePath(import.meta.dirname)}/`;

/**
 * The plugins of the kernel, for Vite and Vitest:
 * - the dependencies of the classes, for the containers (see declareDependencies);
 * - the contexts, found by convention in {source}/backend and {source}/frontend (see discovered.ts and discoveredFrontends.ts).
 * @param {KernelOptions} [options]
 * @returns {Plugin[]}
 */
export function kernel({ source = "src" } = {}) {
  const folder = `/${source.replace(/^\/+|\/+$/g, "")}`;
  return [dependencies(folder), contexts(folder)];
}

/**
 * Writes, after the code of each module, the dependencies of its classes and the names of its tokens: in the modules whose classes the
 * containers build, those of the project and those of the kernel. They are written before the minifier renames the code.
 * @param {string} source
 * @returns {Plugin}
 */
function dependencies(source) {
  /** @type {string[]} */
  let folders = [];
  return {
    name: "kernel-dependencies",
    enforce: "pre",
    configResolved: config => { folders = [`${config.root}${source}/`, OWN_FOLDER]; },
    transform(code, id) {
      if (!id.endsWith(".ts") || !folders.some(folder => id.startsWith(folder))) return undefined;
      const declarations = declareDependencies(code, id, parseSync, [KERNEL]);
      if (declarations === undefined) return undefined;
      // The written code maps to no line of the module: the stack traces and the coverage show only the code of the module.
      const module = new MagicString(code).append(`\n${declarations}`);
      return { code: module.toString(), map: module.generateMap({ hires: true, source: id }) };
    }
  };
}

/**
 * The modules that find the contexts. Vite reads the patterns when it builds: they must be literal, and they start at the root of the
 * project, because a virtual module has no folder. The test.di.ts files have modules of their own: the production code never reads them.
 * @param {string} source
 * @returns {Plugin}
 */
function contexts(source) {
  /** @type {(pattern: string, onlyDefault?: boolean) => string} */
  const glob = (pattern, onlyDefault = false) =>
    `import.meta.glob(${JSON.stringify(`${source}/${pattern}`)}, { eager: true${onlyDefault ? `, import: "default"` : ""} })`;
  /** @type {Record<string, string>} */
  const modules = {
    "virtual:kernel/backend": [
      `export const bindings = ${glob("backend/*/di.ts", true)};`,
      `export const dtos = ${glob("backend/*/application/*/*/*.dto.ts")};`,
      `export const handlers = ${glob("backend/*/application/*/*/*.handler.ts")};`,
      `export const controllers = ${glob("backend/*/presentation/*/*.controller.ts")};`,
      `export const map = ${glob("backend/context-map.ts", true)};`
    ].join("\n"),
    "virtual:kernel/backend-test": `export const bindings = ${glob("backend/*/test.di.ts", true)};`,
    "virtual:kernel/frontend": [
      `export const bindings = ${glob("frontend/*/di.ts", true)};`,
      `export const dtos = ${glob("frontend/*/application/*/*/*.dto.ts")};`,
      `export const handlers = ${glob("frontend/*/application/*/*/*.handler.ts")};`,
      `export const stores = ${glob("frontend/*/presentation/store/*Store.ts", true)};`
    ].join("\n"),
    "virtual:kernel/frontend-test": `export const bindings = ${glob("frontend/*/test.di.ts", true)};`
  };
  return {
    name: "kernel-contexts",
    config: () => ({
      // Vite processes the package as the code of the project, also when it is installed: it holds TypeScript and imports these modules.
      ssr: { noExternal: [KERNEL] },
      optimizeDeps: { exclude: [KERNEL] },
      // The shortcut #shared leads to the backend context shared from every file (the tsconfig.json of the project says it to TypeScript).
      // Vite reads an alias before the "imports" of the package.json of a context (#context), which cannot lead out of the context.
      resolve: { alias: [{ find: /^#shared\//, replacement: `${source}/backend/shared/` }] }
    }),
    resolveId: id => Object.hasOwn(modules, id) ? `\0${id}` : undefined,
    load: id => id.startsWith("\0") && Object.hasOwn(modules, id.slice(1)) ? modules[id.slice(1)] : undefined
  };
}

/** The file of the types of the routes, which @marko/run writes in the folder .marko-run of the project. */
const ROUTE_TYPES = /[\\/]\.marko-run[\\/]routes\.d\.ts$/;
let routeTypesWrittenWhole = false;

/**
 * Makes @marko/run write the types of the routes (.marko-run/routes.d.ts) whole. It writes the file in place each time it reads the
 * routes (a build, a start of Vitest or of the development server): while it writes, the file is empty. `caits check` runs the checks
 * at once, and the lint and the type check read this file: they saw it empty when another check started. Now the text goes in a file of
 * its own, which then takes the name of the file. @marko/run gives no other way: the plugin replaces the writeFile of node:fs, for this
 * file only, as soon as the configuration of Vite makes the plugin, before the plugins write anything.
 * @returns {Plugin}
 */
export function wholeRouteTypes() {
  if (!routeTypesWrittenWhole) {
    routeTypesWrittenWhole = true;
    const { writeFile, rename } = files;
    /** @type {typeof files.writeFile} */
    const writeWhole = async (file, data, options) => {
      if (typeof file !== "string" || !ROUTE_TYPES.test(file)) return writeFile(file, data, options);
      const draft = `${file}.${process.pid}.tmp`;
      await writeFile(draft, data, options);
      await rename(draft, file);
    };
    files.writeFile = writeWhole;
  }
  return { name: "caits-whole-route-types" };
}
