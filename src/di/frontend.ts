import type { EventPublisher } from "../messaging/EventPublisher.js";
import { eventsFor, type Line } from "../messaging/FrontendContextMap.js";
import { createFrontend } from "./createFrontend.js";
import { discoveredFrontends } from "./discoveredFrontends.js";
import type { Fetcher } from "./Fetcher.js";

/**
 * The frontends of the contexts, by name. Each context adds its own, next to its type:
 * `declare module "@ingenioz-it/caits/di/frontend" { interface Frontends { counter: CounterFrontend } }`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- the contexts fill it
export interface Frontends {}

const kept = Symbol("frontends");
type Global = { fetch?: Fetcher; [kept]?: Map<string, unknown> };

/** The frontends kept on a $global, by name. A test can put its own there before a view asks. */
export function frontendsOn($global: object): Map<string, unknown> {
  return ($global as Global)[kept] ??= new Map<string, unknown>();
}

/** The context whose bus is the shared bus: the context maps share its events there, and hear them. */
const SHARED = "shared";

/**
 * The frontend of a context, for the views of one $global: the server has one $global per request, the browser one per page.
 * It is built the first time a view asks. On the server, it reaches the API with the fetch of the request (Marko Run, in the
 * same process); in the browser, with the fetch of the browser. The bus of the context shared is the shared bus of the $global: the
 * context map of a context shares there the events of shared that the events of its context give, and each of them goes to the
 * contexts whose context map hears it.
 */
export function frontendOf<Name extends keyof Frontends>($global: object, name: Name): Frontends[Name] {
  return frontendNamed($global, name) as Frontends[Name];
}

/** The frontend of the context of this name on a $global, built the first time that something asks for it. */
function frontendNamed($global: object, name: string): unknown {
  const frontends = frontendsOn($global);
  if (!frontends.has(name)) {
    const context = discoveredFrontends[name];
    if (!context) throw new Error(`No frontend context is named ${name}`);
    const frontend = createFrontend(context, ($global as Global).fetch ?? ((input, init) => fetch(input, init)));
    frontends.set(name, frontend);
    if (name === SHARED) frontend.events.subscribe(event => { hear($global, event as object); });
    frontend.events.subscribe(event => { tell($global, context.map, event as object); });
  }
  return frontends.get(name);
}

/** The lines of a map that hear the context shared, or those that share with it. */
const lines = (map: readonly Line[], shares: boolean) => map.filter(line => line.shares === shares);

/**
 * An event of a context, on its bus: the events of shared that the lines of its map that share give go to the shared bus of the $global.
 * The frontend of shared is built when a context first shares an event.
 */
function tell($global: object, map: readonly Line[], event: object): void {
  const told = eventsFor(lines(map, true), event);
  if (told.length === 0) return;
  const { events: shared } = frontendNamed($global, SHARED) as { events: EventPublisher<object> };
  for (const sharedEvent of told) shared.publish(sharedEvent);
}

/**
 * An event of the context shared, on the shared bus of a $global: each context whose context map hears it publishes the events that
 * the lines that hear it give on its own bus, its frontend built if no view asked for it yet. A context that does not hear it is not
 * built.
 */
function hear($global: object, event: object): void {
  for (const [name, context] of Object.entries(discoveredFrontends)) {
    const events = eventsFor(lines(context.map, false), event);
    if (events.length === 0) continue;
    const { events: bus } = frontendNamed($global, name) as { events: EventPublisher<object> };
    for (const own of events) bus.publish(own);
  }
}
