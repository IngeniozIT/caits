// `caits dev`: starts the development server, as `marko-run dev` does, on the port PORT (3000 when not set).
// Before it starts, `marko-run dev` connects to the port of the server and to the port of HMR to find out whether they are free, and
// it waits for an answer with no time limit. With WSL `networkingMode=mirrored`, a connection to a closed port of 127.0.0.1 gets no
// answer, so `marko-run dev` never starts. This command gives both ports, so @marko/run does not check them.
// If a port is already in use, the server stops with EADDRINUSE.
// It uses the Vite configuration of the project, quality/vite.config.ts: Marko, and the plugin of CAITS.
import adapter from "@marko/run/adapter";

export const VITE_CONFIG = "quality/vite.config.ts";

export async function run(args) {
  const port = Number(process.env.PORT ?? 3000);
  const hmrPort = 24678;
  const server = adapter();
  await server.startDev({
    entry: await server.getEntryFile(),
    config: { root: process.cwd(), configFile: VITE_CONFIG, server: { hmr: { port: hmrPort } } },
    options: { cwd: process.cwd(), args, port }
  });
}
