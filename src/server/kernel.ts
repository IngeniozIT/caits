import { startBackend, stopBackend } from "../di/backend.js";
import type { BackendOptions } from "../di/createBackend.js";
import type { Stop } from "./serve.js";

/**
 * Boots the backend of the server, with the bindings of the di.ts of the contexts, and starts its timers. Gives what stops it: the server
 * of `npm start` and that of `caits dev` call it when they stop, and `caits dev` before it boots the backend again. A backend whose timers
 * cannot start stops at once, and releases what it built: the boot fails.
 */
export async function boot(options: BackendOptions = {}): Promise<Stop> {
  const backend = startBackend(options);
  try {
    backend.start();
  } catch (error) {
    await stopBackend();
    throw error;
  }
  return (requestsDone, graceOver) => stopBackend(requestsDone, graceOver);
}
