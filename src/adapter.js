// The adapter of @marko/run for a CAITS app: quality/caits/vite.ts gives it to the plugin of @marko/run. JavaScript, not TypeScript: Node
// loads it with the configuration of Vite, and strips no types in node_modules, where a project installs the kernel.
// - `npm run build` builds the server of `npm start` from server/entry.ts: it boots the backend, and stops it on SIGTERM or SIGINT.
// - `caits dev` serves the app with the dev server of @marko/run, in a server of its own (server/serve.js): it boots the backend through
//   Vite, boots it again when a module that the backend imports changes, and stops it when it closes.
import { fileURLToPath } from "node:url";
import baseAdapter, { createDevServer } from "@marko/run/adapter";
import { serve } from "./server/serve.js";

/** @import { Adapter } from "@marko/run/vite" */
/** @import { ModuleNode, ViteDevServer } from "vite" */

const ENTRY = fileURLToPath(new URL("./server/entry.ts", import.meta.url));
const KERNEL = fileURLToPath(new URL("./server/kernel.ts", import.meta.url));

/**
 * The adapter of @marko/run that serves a CAITS app: that of Node, whose server boots the backend and stops it.
 * @returns {Adapter}
 */
export function adapter() {
  return {
    ...baseAdapter(),
    name: "caits",
    getEntryFile: () => ENTRY,
    startDev: async ({ config, options }) => {
      const vite = await createDevServer(config);
      /** @type {Awaited<ReturnType<typeof serve>>} */
      let served;
      try {
        served = await serve({
          handle: vite.middlewares,
          port: options.port ?? 3000,
          boot: async () => /** @type {typeof import("./server/kernel.js")} */ (await vite.ssrLoadModule(KERNEL)).boot()
        });
      } catch (error) {
        // A first boot that fails, or a port in use: the server of Vite and its watcher would keep the command alive, and nothing would
        // answer. The command ends, with the error.
        await vite.close();
        throw error;
      }
      vite.watcher.on("change", file => {
        if (!imports(vite, KERNEL, file)) return;
        forget(vite, file);
        void served.reboot();
      });
      // The words of the server of @marko/run: who waits for the server reads them.
      console.log(`\n  Server listening at\n  http://localhost:${served.port}\n`);
      return {
        port: served.port,
        close: async () => {
          await served.close();
          await vite.close();
        }
      };
    }
  };
}

/**
 * Whether a module that Vite loaded imports a file, itself or through the modules that it imports.
 * @param {ViteDevServer} vite
 * @param {string} id
 * @param {string} file
 */
function imports(vite, id, file) {
  /** @type {Set<ModuleNode>} */
  const seen = new Set();
  /** @type {(module: ModuleNode | undefined) => boolean} */
  const visit = module => {
    if (!module || seen.has(module)) return false;
    seen.add(module);
    return module.file === file || [...module.importedModules].some(visit);
  };
  return visit(vite.moduleGraph.getModuleById(id));
}

/**
 * Makes Vite forget a file that changed, and the modules that import it: the backend that boots again loads their new code. Vite would
 * forget them itself, but after the watchers of the project see the change.
 * @param {ViteDevServer} vite
 * @param {string} file
 */
function forget(vite, file) {
  /** @type {Set<ModuleNode>} */
  const seen = new Set();
  /** @type {(module: ModuleNode) => void} */
  const visit = module => {
    if (seen.has(module)) return;
    seen.add(module);
    vite.moduleGraph.invalidateModule(module);
    for (const importer of module.importers) visit(importer);
  };
  for (const module of vite.moduleGraph.getModulesByFile(file) ?? []) visit(module);
}
