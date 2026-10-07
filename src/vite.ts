import MagicString from "magic-string";
import { normalizePath, parseSync, type Plugin } from "vite";
// Node reads this file itself when Vite loads its config, and Node does not change .js into .ts: the import names the .ts file.
import { declareDependencies } from "./di/declareDependencies.ts";

/** The name of this package: the app imports the tokens of the kernel (EventPublisher, DataDirectory, Fetcher…) with it. */
const KERNEL = "@ingeniozits/kernel";

/** The folder of the kernel: its classes and its tokens need the same code (a Controller gets its MessageBus, a token its name). */
const OWN_FOLDER = `${normalizePath(import.meta.dirname)}/`;

export type KernelOptions = {
  /** The folder that holds backend/ and frontend/, from the root of the project. */
  source?: string;
};

/**
 * The plugins of the kernel, for Vite and Vitest:
 * - the dependencies of the classes, for the containers (see declareDependencies);
 * - the contexts, found by convention in {source}/backend and {source}/frontend (see discovered.ts and discoveredFrontends.ts).
 */
export function kernel({ source = "src" }: KernelOptions = {}): Plugin[] {
  const folder = `/${source.replace(/^\/+|\/+$/g, "")}`;
  return [dependencies(folder), contexts(folder)];
}

/**
 * Writes, after the code of each module, the dependencies of its classes and the names of its tokens: in the modules whose classes the
 * containers build, those of the project and those of the kernel. They are written before the minifier renames the code.
 */
function dependencies(source: string): Plugin {
  let folders: string[] = [];
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
 */
function contexts(source: string): Plugin {
  const glob = (pattern: string, onlyDefault = false) =>
    `import.meta.glob(${JSON.stringify(`${source}/${pattern}`)}, { eager: true${onlyDefault ? `, import: "default"` : ""} })`;
  const modules: Record<string, string> = {
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
