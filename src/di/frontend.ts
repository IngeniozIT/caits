import { createFrontend } from "./createFrontend.js";
import { discoveredFrontends } from "./discoveredFrontends.js";
import type { Fetcher } from "./Fetcher.js";

/**
 * The frontends of the contexts, by name. Each context adds its own, next to its type:
 * `declare module "@ingeniozits/kernel/di/frontend" { interface Frontends { counter: CounterFrontend } }`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- the contexts fill it
export interface Frontends {}

const kept = Symbol("frontends");
type Global = { fetch?: Fetcher; [kept]?: Map<string, unknown> };

/** The frontends kept on a $global, by name. A test can put its own there before a view asks. */
export function frontendsOn($global: object): Map<string, unknown> {
  return ($global as Global)[kept] ??= new Map<string, unknown>();
}

/**
 * The frontend of a context, for the views of one $global: the server has one $global per request, the browser one per page.
 * It is built the first time a view asks. On the server, it reaches the API with the fetch of the request (Marko Run, in the
 * same process); in the browser, with the fetch of the browser.
 */
export function frontendOf<Name extends keyof Frontends>($global: object, name: Name): Frontends[Name] {
  const frontends = frontendsOn($global);
  if (!frontends.has(name)) {
    const context = discoveredFrontends[name];
    if (!context) throw new Error(`No frontend context is named ${name}`);
    frontends.set(name, createFrontend(context, ($global as Global).fetch ?? ((input, init) => fetch(input, init))));
  }
  return frontends.get(name) as Frontends[Name];
}
