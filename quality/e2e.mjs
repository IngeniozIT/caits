// `caits e2e`: runs the end-to-end tests of quality/playwright.config.ts on the production build.
// Playwright can start the servers itself (webServer), but it first connects to its address to find out whether a server runs there.
// With WSL `networkingMode=mirrored`, a connection to a closed port of 127.0.0.1 gets no answer, so Playwright waits forever. This
// command starts each server of webServer itself, waits with a time limit until it answers, then lets Playwright use them.
import { spawn, spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const PLAYWRIGHT_CONFIG = "quality/playwright.config.ts";

export async function run(args) {
  const { default: config } = await import(pathToFileURL(join(process.cwd(), PLAYWRIGHT_CONFIG)).href);
  const webServers = [config.webServer ?? []].flat();
  if (webServers.some(({ command, url }) => !command || !url)) throw new Error(`each webServer of ${PLAYWRIGHT_CONFIG} must give a command and a url`);

  const servers = [];
  try {
    for (const { command, url, cwd, env = {} } of webServers) {
      if (env.DATA_DIR) rmSync(env.DATA_DIR, { recursive: true, force: true });
      servers.push(await startServer(command, url, cwd, env));
    }
    return spawnSync("npx", ["playwright", "test", "--config", PLAYWRIGHT_CONFIG, ...args], { stdio: "inherit", env: { ...process.env, E2E_REUSE_SERVER: "1" } }).status ?? 1;
  } finally {
    for (const server of servers) server.stop();
  }
}

/** Runs the command of the server in a group of processes of its own, so that `stop` also stops the processes that it starts. */
async function startServer(command, url, cwd, env) {
  const server = spawn(command, { cwd, shell: true, stdio: "inherit", detached: true, env: { ...process.env, ...env } });
  const stop = () => { try { process.kill(-server.pid); } catch {} };
  process.on("exit", stop);
  for (let attempt = 0; attempt < 1200; attempt++) {
    if (server.exitCode !== null) throw new Error(`The server stopped (${command})`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(500) });
      if (response.ok) return { stop };
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  stop();
  throw new Error(`The server did not answer at ${url} (${command})`);
}
