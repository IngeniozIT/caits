import { createBackend, type Backend, type BackendOptions } from "./createBackend.js";
import { discovered } from "./discovered.js";

let current: Backend | undefined;

/** Starts the backend that serves the requests, with the bindings given replacing those of the contexts. */
export function startBackend(options: BackendOptions = {}): Backend {
  return current = createBackend(discovered, options);
}

/** The backend that serves the requests, started with the production bindings on first use. */
export function backend(): Backend {
  return current ?? startBackend();
}

/** The controller of a context, built for a new request with a correlation id of its own. */
export function controller<C>(type: abstract new (...args: never[]) => C): C {
  return backend().controller(type, { correlationId: crypto.randomUUID() });
}
