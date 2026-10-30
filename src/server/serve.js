// The HTTP server of an app, for `npm start` (entry.ts) and for `caits dev` (adapter.js). JavaScript, not TypeScript: `caits dev` loads
// it with Node, which strips no types in node_modules, where a project installs the kernel.
import { createServer } from "node:http";

/** @import { IncomingMessage, ServerResponse } from "node:http" */
/** @import { AddressInfo } from "node:net" */

/**
 * What stops the backend: its feeds and its timers, then, once the requests that the server serves are done (the promise), what its
 * containers built. The signal aborts when the grace ends: the backend waits for its turns and its reactions until then at most.
 * @typedef {(requestsDone: Promise<unknown>, graceOver: AbortSignal) => Promise<void>} Stop
 */

/**
 * @typedef {object} ServeOptions
 * @property {(request: IncomingMessage, response: ServerResponse) => void} handle The requests: the pages, the handlers, the files.
 * @property {number} port The port, 0 for any free port.
 * @property {() => Stop | Promise<Stop>} boot Boots the backend, and gives what stops it.
 * @property {number} [grace] How long the requests, the turns of the timers and the reactions that run may still run once the server
 *   stops, in milliseconds: 10 s by default.
 * @property {(error: unknown) => void} [reportError] Reports a boot that fails at a reboot: the console by default.
 */

/** What stops no backend: that of a reboot whose boot failed. */
const NO_STOP = async () => {};

/**
 * Boots the backend, then serves the requests on the port.
 * - `reboot` stops the backend, then boots it again (`caits dev` does it when its code changes): never two backends at once. A request
 *   that comes meanwhile waits for the new backend. A boot that fails is reported: the server serves on, and the next reboot boots again.
 * - `close` serves no new request, stops the backend (which ends its feeds, then its timers), lets the requests that run end (after the
 *   grace, it closes their connections), then releases what the backend built. The connection of a request that ends closes. A request
 *   that comes meanwhile on a connection that still serves another gets a 503, which closes the connection. A reboot after it boots
 *   nothing.
 * @param {ServeOptions} options
 */
export async function serve({ handle, port, boot, grace = 10_000, reportError = error => { console.error(error); } }) {
  let stop = await boot();
  /** @type {Promise<void>} the reboots, one after the other */
  let reboots = Promise.resolve();
  /** @type {Promise<void> | undefined} */
  let closing;
  const server = createServer((request, response) => {
    if (closing) {
      response.writeHead(503, { connection: "close" }).end();
      return;
    }
    // A response that ends while the server closes frees its connection: the server closes it. A stream that started before said that
    // the connection stays open, and the client would keep it until its own delay, a few seconds, which the close would wait for.
    response.once("finish", () => { if (closing) server.closeIdleConnections(); });
    void reboots.then(() => { handle(request, response); });
  });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject).listen(port, () => { resolve(undefined); }); });
  } catch (error) {
    await stop(Promise.resolve(), AbortSignal.abort());
    throw error;
  }
  return {
    port: /** @type {AddressInfo} */ (server.address()).port,
    /** @returns {Promise<void>} */
    reboot: () => (reboots = reboots.then(async () => {
      if (closing) return;
      try {
        // A reboot lets no request end: no grace.
        await stop(Promise.resolve(), AbortSignal.abort());
        stop = NO_STOP;
        stop = await boot();
      } catch (error) {
        reportError(error);
      }
    })),
    /** @returns {Promise<void>} */
    close: () => (closing ??= (async () => {
      await reboots;
      const requestsDone = new Promise(resolve => { server.close(() => { resolve(undefined); }); });
      const graceOver = new AbortController();
      const cut = setTimeout(() => {
        server.closeAllConnections();
        graceOver.abort();
      }, grace);
      await stop(requestsDone, graceOver.signal);
      clearTimeout(cut);
    })())
  };
}

/**
 * @typedef {object} SignalOptions
 * @property {{ on(signal: "SIGTERM" | "SIGINT", listener: () => void): unknown }} [signals] Where the signals come: the process by default.
 * @property {(code: number) => void} [exit] Ends the process: process.exit by default.
 * @property {(error: unknown) => void} [reportError] Reports a close that fails: the console by default.
 */

/** How long after the first signal a second one ends the process at once, in milliseconds. */
const SECOND_SIGNAL_MS = 1000;

/**
 * Closes the server on SIGTERM (`docker stop`) or SIGINT (Ctrl+C), then ends the process: 0 when the close succeeds, 1 when it fails. A
 * second signal, a second or more after the first, ends it at once, with 1. A signal often comes twice at once: Ctrl+C reaches each
 * process of the group of the terminal, and npm, in `npm start`, passes it on to the server. It counts once.
 * @param {() => Promise<void>} close
 * @param {SignalOptions} [options]
 */
export function stopOnSignals(close, { signals = process, exit = code => process.exit(code), reportError = error => { console.error(error); } } = {}) {
  /** @type {number | undefined} */
  let stoppedAt;
  const stopNow = () => {
    if (stoppedAt !== undefined) {
      if (Date.now() - stoppedAt >= SECOND_SIGNAL_MS) exit(1);
      return;
    }
    stoppedAt = Date.now();
    close().then(() => { exit(0); }, error => {
      reportError(error);
      exit(1);
    });
  };
  signals.on("SIGTERM", stopNow);
  signals.on("SIGINT", stopNow);
}
