import { createBackend, type Backend, type BackendOptions } from "./createBackend.js";
import { discovered } from "./discovered.js";

let current: Backend | undefined;

/** Starts the backend that serves the requests, with the bindings given replacing those of the contexts. */
export function startBackend(options: BackendOptions = {}): Backend {
  return current = createBackend(discovered, options);
}

/**
 * Stops the backend that serves the requests, if one started, then forgets it: its feeds, its timers, the turns that run, the requests
 * that the server still serves (the promise that it gives), the reactions, until the grace ends (the signal), then what its containers
 * built. The next use starts a new one. A request that comes
 * while it stops gets it: a new backend would outlive the server, since nothing would stop it.
 */
export async function stopBackend(requestsDone?: Promise<unknown>, graceOver?: AbortSignal): Promise<void> {
  const stopping = current;
  await stopping?.stop(requestsDone, graceOver);
  if (current === stopping) current = undefined;
}

/** The backend that serves the requests, started with the production bindings on first use. */
export function backend(): Backend {
  return current ?? startBackend();
}

/** The controller of a context, built for a new request with a correlation id of its own. */
export function controller<C>(type: abstract new (...args: never[]) => C): C {
  return backend().controller(type, { correlationId: crypto.randomUUID() });
}
