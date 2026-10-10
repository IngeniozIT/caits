import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { startServer } from "./e2e.mjs";

/** @type {string[]} */
const folders = [];
/** @type {(() => void)[]} */
const stops = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function newFolder() {
  const folder = mkdtempSync(join(tmpdir(), "caits-e2e-"));
  folders.push(folder);
  return folder;
}

/**
 * A server that listens on a free port of 127.0.0.1: the system chooses the port.
 * @returns {Promise<{ port: number; close: () => Promise<void> }>}
 */
async function listening() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(undefined)));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("the server has no port");
  return { port: address.port, close: () => new Promise(resolve => server.close(() => resolve())) };
}

/** A port that no server uses. */
async function freePort() {
  const { port, close } = await listening();
  await close();
  return port;
}

/**
 * A command that answers "ok" over HTTP on a port, as the production server does.
 * @param {number} port
 */
const httpServer = port => `node -e "require('node:http').createServer((_, response) => response.end('ok')).listen(${port}, '127.0.0.1')"`;

describe("the servers of the end-to-end tests", () => {
  test("starts the server, and waits until it answers at its URL; stop stops it", async () => {
    const port = await freePort();
    const url = `http://127.0.0.1:${port}/`;

    const server = await startServer({ command: httpServer(port), url, cwd: newFolder(), env: {}, timeout: 10_000 });
    stops.push(server.stop);

    expect(await (await fetch(url)).text()).toBe("ok");
    server.stop();
    await expect.poll(() => fetch(url, { signal: AbortSignal.timeout(500) }).then(() => "answers", () => "stopped")).toBe("stopped");
  }, 20_000);

  test("refuses a port that another server uses, and starts nothing: the tests would run on the other server", async () => {
    const other = await listening();
    const cwd = newFolder();
    try {
      const attempt = startServer({ command: "node -e \"require('node:fs').writeFileSync('started', '')\"", url: `http://127.0.0.1:${other.port}/`, cwd, env: {}, timeout: 10_000 });

      await expect(attempt).rejects.toThrow(`Port ${other.port} is in use: a server runs at http://127.0.0.1:${other.port}/ already. Stop it, then run the end-to-end tests again.`);
      await new Promise(resolve => setTimeout(resolve, 300));
      expect(existsSync(join(cwd, "started"))).toBe(false);
    } finally {
      await other.close();
    }
  });

  test("waits as long as webServer.timeout says, then stops the server", async () => {
    const cwd = newFolder();
    const url = `http://127.0.0.1:${await freePort()}/`;
    const started = Date.now();

    const attempt = startServer({ command: "node -e \"setTimeout(() => {}, 60_000)\"", url, cwd, env: {}, timeout: 300 });

    await expect(attempt).rejects.toThrow(`The server did not answer at ${url} in 0.3 s (node -e "setTimeout(() => {}, 60_000)")`);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  test("tells when the server stops before it answers", async () => {
    const url = `http://127.0.0.1:${await freePort()}/`;

    await expect(startServer({ command: "exit 3", url, cwd: newFolder(), env: {}, timeout: 10_000 })).rejects.toThrow("The server stopped (exit 3)");
  });

  test("gives the server the variables of webServer.env", async () => {
    const port = await freePort();
    const url = `http://127.0.0.1:${port}/`;
    const command = "node -e \"require('node:http').createServer((_, response) => response.end(process.env.GREETING)).listen(process.env.PORT, '127.0.0.1')\"";

    const server = await startServer({ command, url, cwd: newFolder(), env: { PORT: String(port), GREETING: "hello" }, timeout: 10_000 });
    stops.push(server.stop);

    expect(await (await fetch(url)).text()).toBe("hello");
  }, 20_000);
});
