// JavaScript, not TypeScript: Node loads this file itself when Vite loads its configuration, and Node strips no types in node_modules,
// where a project installs the kernel. TypeScript checks the types of the comments; vite.types.d.ts gives them to the projects.
import { promises as files } from "node:fs";
import MagicString from "magic-string";
import { normalizePath, parseSync } from "vite";
import { declareDependencies } from "./di/declareDependencies.js";

/** @import { Plugin } from "vite" */
/** @import { KernelOptions } from "./vite.types.js" */

/** The name of this package: the app imports the tokens of the kernel (EventPublisher, DataDirectory, Fetcher…) with it. */
const KERNEL = "@ingenioz-it/caits";

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
 * The modules that find the contexts: each export of a module is a pattern of files, from the source folder, and whether it takes only
 * the default export of each file. The test.di.ts files have modules of their own: the production code never reads them.
 * @type {Record<string, [name: string, pattern: string, onlyDefault?: boolean][]>}
 */
const CONTEXT_MODULES = {
  "virtual:kernel/backend": [
    ["bindings", "backend/*/di.ts", true],
    ["handlers", "backend/*/{command,query}/*/*.handler.ts"],
    ["controllers", "backend/*/{command,query}/*/*.controller.ts"],
    ["maps", "backend/*/context-map.ts", true]
  ],
  "virtual:kernel/backend-test": [["bindings", "backend/*/test.di.ts", true]],
  "virtual:kernel/frontend": [
    ["bindings", "frontend/*/di.ts", true],
    ["handlers", "frontend/*/{command,query}/*/*.handler.ts"],
    ["stores", "frontend/*/presentation/store/*Store.ts", true],
    ["maps", "frontend/*/context-map.ts", true]
  ],
  "virtual:kernel/frontend-test": [["bindings", "frontend/*/test.di.ts", true]]
};

/**
 * The modules that find the contexts. Vite reads the patterns when it builds: they must be literal, and they start at the root of the
 * project, because a virtual module has no folder.
 * Vite and Vitest follow the files that a module loaded, but not the new files that its patterns find: when a file of a pattern comes
 * or goes, the plugin makes the environments load the module again. It also tells the watcher that the files that import the module
 * changed: Vitest, in watch mode, then runs again the tests that use them (a new handler is found without a restart of Vitest).
 * @param {string} source
 * @returns {Plugin}
 */
function contexts(source) {
  /** @type {(pattern: string, onlyDefault?: boolean) => string} */
  const glob = (pattern, onlyDefault = false) =>
    `import.meta.glob(${JSON.stringify(`${source}/${pattern}`)}, { eager: true${onlyDefault ? `, import: "default"` : ""} })`;
  /** A pattern as a regular expression: `*` is a part of a name, without "/", and `{command,query}` one of these names. */
  const matcherOf = (/** @type {string} */ pattern) => new RegExp(`^${`${source}/${pattern}`.replace(/[.+?^$()|[\]\\]/g, "\\$&").replaceAll("*", "[^/]*")
    .replace(/\{([^}]*)\}/g, (/** @type {string} */ _, /** @type {string} */ names) => `(?:${names.split(",").join("|")})`)}$`);
  const modules = Object.entries(CONTEXT_MODULES).map(([id, exports]) => ({
    id,
    code: exports.map(([name, pattern, onlyDefault]) => `export const ${name} = ${glob(pattern, onlyDefault)};`).join("\n"),
    matchers: exports.map(([, pattern]) => matcherOf(pattern))
  }));
  const moduleOf = (/** @type {string} */ id) => modules.find(module => module.id === id);
  let root = "";
  return {
    name: "kernel-contexts",
    config: () => ({
      // Vite processes the package as the code of the project, also when it is installed: it holds TypeScript and imports these modules.
      ssr: { noExternal: [KERNEL] },
      optimizeDeps: { exclude: [KERNEL] },
      // The shortcut #shared leads to the backend context shared from every file, and #frontend-shared to the frontend context shared
      // (the tsconfig.json of the project says it to TypeScript). Vite reads an alias before the "imports" of the package.json of a
      // context (#context), which cannot lead out of the context.
      resolve: {
        alias: [
          { find: /^#shared\//, replacement: `${source}/backend/shared/` },
          { find: /^#frontend-shared\//, replacement: `${source}/frontend/shared/` }
        ]
      }
    }),
    configResolved: config => { root = config.root; },
    configureServer: server => {
      /** @param {string} file */
      const reload = file => {
        const path = normalizePath(file);
        if (!path.startsWith(`${root}/`)) return;
        const fromRoot = path.slice(root.length);
        for (const { id } of modules.filter(({ matchers }) => matchers.some(matcher => matcher.test(fromRoot)))) {
          /** @type {Set<string>} */
          const importers = new Set();
          for (const { moduleGraph } of Object.values(server.environments)) {
            const loaded = moduleGraph.getModuleById(`\0${id}`);
            if (!loaded) continue;
            moduleGraph.invalidateModule(loaded);
            for (const { file: importer } of loaded.importers) if (importer) importers.add(importer);
          }
          for (const importer of importers) server.watcher.emit("change", importer);
        }
      };
      server.watcher.on("add", reload);
      server.watcher.on("unlink", reload);
    },
    resolveId: id => moduleOf(id) ? `\0${id}` : undefined,
    load: id => id.startsWith("\0") ? moduleOf(id.slice(1))?.code : undefined
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
