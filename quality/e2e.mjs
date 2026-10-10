// `caits e2e`: runs the end-to-end tests of quality/playwright.config.ts on the production build.
// Playwright can start the servers itself (webServer), but it first connects to its address to find out whether a server runs there.
// With WSL `networkingMode=mirrored`, a connection to a closed port of 127.0.0.1 gets no answer, so Playwright waits forever. This
// command starts each server of webServer itself, waits with a time limit until it answers, then lets Playwright use them.
import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { constants } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const PLAYWRIGHT_CONFIG = "quality/playwright.config.ts";

/** How long a server has to answer, when its webServer gives no timeout, in milliseconds. */
const DEFAULT_TIMEOUT = 120_000;

/** @typedef {{ command: string; url: string; cwd?: string; env?: Record<string, string>; timeout: number }} WebServer */

/** @type {(file: string) => Promise<unknown>} */
const importFile = file => import(pathToFileURL(file).href);

/**
 * Stops a process that runs in a group of processes of its own, and the processes that it started.
 * @param {import("node:child_process").ChildProcess} child
 */
function stopGroup(child) {
  try {
    if (child.pid) process.kill(-child.pid);
  } catch {
    // The group stopped already.
  }
}

/**
 * Starts the servers, empties the folder of the data of each (DATA_DIR) first, then runs Playwright. The end of the command stops the
 * servers, also when Ctrl+C (SIGINT) or `caits check` (SIGTERM) stops it: the exit code then tells the signal, 130 or 143.
 * @param {string[]} args the arguments of Playwright
 * @returns {Promise<number>}
 */
export async function run(args) {
  const file = join(process.cwd(), PLAYWRIGHT_CONFIG);
  if (!existsSync(file)) throw new Error(`${PLAYWRIGHT_CONFIG} is missing: it gives the end-to-end tests and their server. Run \`npx caits init .\` to write it.`);
  const { default: config } = /** @type {{ default: { webServer?: Partial<WebServer> | Partial<WebServer>[] } }} */ (await importFile(file));
  const webServers = [config.webServer ?? []].flat();

  /** @type {{ stop: () => void }[]} */
  const servers = [];
  /** @type {import("node:child_process").ChildProcess | undefined} */
  let playwright;
  const stop = () => {
    if (playwright) stopGroup(playwright);
    for (const server of servers) server.stop();
  };
  /** @param {NodeJS.Signals} signal */
  const interrupt = signal => {
    stop();
    process.exit(128 + constants.signals[signal]);
  };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    for (const { command, url, cwd, env = {}, timeout = DEFAULT_TIMEOUT } of webServers) {
      if (!command || !url) throw new Error(`each webServer of ${PLAYWRIGHT_CONFIG} must give a command and a url`);
      if (env.DATA_DIR) rmSync(env.DATA_DIR, { recursive: true, force: true });
      servers.push(await startServer({ command, url, cwd, env, timeout }));
    }
    // Playwright runs in a group of processes of its own too, with its browsers: `stop` stops them all. It reads nothing from the terminal.
    const env = { ...process.env, E2E_REUSE_SERVER: "1" };
    const started = spawn("npx", ["playwright", "test", "--config", PLAYWRIGHT_CONFIG, ...args], { stdio: ["ignore", "inherit", "inherit"], detached: true, env });
    playwright = started;
    return await new Promise(resolve => {
      started.on("error", () => resolve(1));
      started.on("close", code => resolve(code ?? 1));
    });
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
    stop();
  }
}

/**
 * Runs the command of a server in a group of processes of its own, so that `stop` also stops the processes that it starts, then waits
 * until the server answers at its URL, for `timeout` milliseconds at most. The port of the URL must be free: else the tests would run on
 * the server that uses it, with the build of another project, or of an older run.
 * @param {WebServer} webServer
 * @returns {Promise<{ stop: () => void }>}
 */
export async function startServer({ command, url, cwd, env = {}, timeout }) {
  const { hostname, port, protocol } = new URL(url);
  const portNumber = Number(port) || (protocol === "https:" ? 443 : 80);
  if (!(await isFree(hostname.replace(/^\[|\]$/g, ""), portNumber))) {
    throw new Error(`Port ${portNumber} is in use: a server runs at ${url} already. Stop it, then run the end-to-end tests again.`);
  }
  const server = spawn(command, { cwd, shell: true, stdio: "inherit", detached: true, env: { ...process.env, ...env } });
  const stop = () => stopGroup(server);
  process.on("exit", stop);
  for (const end = Date.now() + timeout; Date.now() < end;) {
    if (server.exitCode !== null) throw new Error(`The server stopped (${command})`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(500) });
      if (response.ok) return { stop };
    } catch {
      // The server does not answer yet.
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  stop();
  throw new Error(`The server did not answer at ${url} in ${timeout / 1000} s (${command})`);
}

/**
 * Whether a server can listen on a port. A listen fails at once when the port is in use: a connection to a closed port can wait forever
 * (see above). Another error (a port that only the system can use) does not tell that a server runs there.
 * @param {string} hostname
 * @param {number} port
 * @returns {Promise<boolean>}
 */
function isFree(hostname, port) {
  return new Promise(resolve => {
    const probe = createServer();
    probe.once("error", (/** @type {NodeJS.ErrnoException} */ error) => resolve(error.code !== "EADDRINUSE"));
    probe.listen(port, hostname, () => probe.close(() => resolve(true)));
  });
}
