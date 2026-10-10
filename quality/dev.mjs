// `caits dev`: starts the development server, as `marko-run dev` does, on the port PORT (3000 when not set).
// Before it starts, `marko-run dev` connects to the port of the server and to the port of HMR to find out whether they are free, and
// it waits for an answer with no time limit. With WSL `networkingMode=mirrored`, a connection to a closed port of 127.0.0.1 gets no
// answer, so `marko-run dev` never starts. This command gives both ports, so @marko/run does not check them: PORT, and HMR_PORT
// (24678 when not set). Two projects can run their servers at the same time, each with its two ports.
// If a port is already in use, the server stops with EADDRINUSE.
// It uses the Vite configuration of the project, quality/vite.config.ts: Marko, and the plugin of CAITS.
// @marko/run writes the entry files of the server in the build folder. `npm run build` (`npm run check` runs it) empties dist/: the
// server writes them in a folder of its own, else it fails at the next change of a file. @marko/vite refuses an entry file whose path
// starts with a dot: the folder is in node_modules/, as the cache of Vite.
import { existsSync } from "node:fs";
import adapter from "@marko/run/adapter";
import { loadConfigFromFile } from "vite";

export const VITE_CONFIG = "quality/vite.config.ts";
export const OUT_DIR = "node_modules/.caits/dev";

/**
 * When a file of its configuration changes (quality/vite.config.ts, an .env file…), Vite restarts its server: it makes a new one, and
 * keeps only the middlewares of Vite. @marko/run adds the middleware of the pages after Vite makes the server: the new server answered
 * 404 to each page. Thus Vite asks `caits dev` for the restart, and `caits dev` closes the server of @marko/run, then starts a new one:
 * - when the configuration does not load (an error in the file), the server that runs stays: Vite asks again at the next change;
 * - a change that comes during a restart makes one more restart, after it: the new server reads the configuration after the change;
 * - when the new server cannot start, the command stops, and tells why.
 * @param {string[]} args the arguments of the server
 */
export async function run(args) {
  if (!existsSync(VITE_CONFIG)) throw new Error(`${VITE_CONFIG} is missing: it gives the configuration of Vite. Run \`npx caits init .\` to write it.`);
  const port = Number(process.env.PORT ?? 3000);
  const hmrPort = Number(process.env.HMR_PORT ?? 24678);
  const marko = adapter();
  // The adapter of Node, which @marko/run gives, has the two methods.
  const getEntryFile = marko.getEntryFile?.bind(marko);
  const startDev = marko.startDev?.bind(marko);
  if (!getEntryFile || !startDev) throw new Error(`The adapter ${marko.name} of @marko/run cannot start a development server.`);
  const entry = await getEntryFile();
  /** @type {import("@marko/run/adapter").SpawnedServer} the server of @marko/run */
  let running;
  /** @type {import("vite").ViteDevServer} its Vite server */
  let vite;
  /** @type {Promise<void> | undefined} */
  let restarting;
  let changedAgain = false;

  const start = async () => {
    running = await startDev({
      entry,
      config: {
        root: process.cwd(),
        configFile: VITE_CONFIG,
        build: { outDir: OUT_DIR },
        server: { hmr: { port: hmrPort } },
        plugins: [restartsTakenBy(server => {
          vite = server;
          server.restart = restart;
        })]
      },
      options: { cwd: process.cwd(), args, port }
    });
  };

  const restartOnce = async () => {
    if (!(await configurationLoads())) return;
    await running.close();
    // @marko/run waits half a second for the close of Vite. The new server needs the port of HMR: it waits for the end of the close.
    await vite.close();
    await start();
  };

  const restart = () => {
    if (restarting) {
      changedAgain = true;
      return restarting;
    }
    restarting = (async () => {
      do {
        changedAgain = false;
        await restartOnce();
      } while (changedAgain);
    })().catch(error => {
      console.error(`\nThe development server stopped: ${error instanceof Error ? error.message : error}\nCorrect the error, then start the server again: npm run dev`);
      process.exit(1);
    }).finally(() => {
      restarting = undefined;
    });
    return restarting;
  };

  await start();
}

/** Whether the Vite configuration of the project loads. When it does not, says why. */
async function configurationLoads() {
  try {
    await loadConfigFromFile({ command: "serve", mode: "development" }, VITE_CONFIG, process.cwd(), "silent");
    return true;
  } catch (error) {
    console.error(`\n${VITE_CONFIG} does not load: the server keeps the configuration that it has.\n${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * A plugin that gives the Vite server to `caits dev`, which takes its restarts (see run).
 * @param {(server: import("vite").ViteDevServer) => void} take
 * @returns {import("vite").Plugin}
 */
function restartsTakenBy(take) {
  return { name: "caits-dev-restart", apply: "serve", configureServer: take };
}
