import type { Line } from "../messaging/FrontendContextMap.js";
import type { StoreDefinition } from "../state/createStore.js";
import type { Binding } from "./Container.js";
import { linesIn, useCaseOf, type UseCase } from "./discover.js";

/**
 * A context of the frontend: its bindings, its use cases, its store (none for a context without a use case: its views and its
 * components publish events, and read no state), and its context map: the events of the context shared that it hears, and the events
 * of its own that it shares.
 */
export type FrontendModules = { bindings: readonly Binding[]; useCases: UseCase[]; store?: StoreDefinition<unknown, unknown>; map: readonly Line[] };

type Modules = Record<string, Record<string, unknown>>;

const contextOf = (path: string) => /frontend\/([^/]+)\//.exec(path)![1];

/** A line of a frontend context map: one that hears and one that shares both give events. */
const isLine = ({ shares, event, events }: Partial<Record<string, unknown>>) => typeof shares === "boolean" && typeof event === "function" && typeof events === "function";

/**
 * Turns the modules found in the frontend folder (src/frontend by default) into the contexts of the frontend: a context has a di.ts,
 * a store at most, and its context map if it hears the context shared or shares events with it; a handler serves the input DTO that
 * its execute takes.
 */
export function discoverFrontends(found: {
  bindings: Record<string, readonly Binding[]>;
  handlers: Modules;
  stores: Record<string, StoreDefinition<unknown, unknown>>;
  maps: Record<string, readonly Line[]>;
}): Record<string, FrontendModules> {
  const contexts: Record<string, FrontendModules> = {};
  for (const [path, bindings] of Object.entries(found.bindings)) {
    const name = contextOf(path);
    const stores = Object.entries(found.stores).filter(([storePath]) => contextOf(storePath) === name).map(([, definition]) => definition);
    if (stores.length > 1) throw new Error(`the frontend ${name} declares one store at most in presentation/store/ (found ${stores.length})`);
    contexts[name] = { bindings, useCases: [], store: stores[0], map: [] };
  }
  for (const [path, map] of Object.entries(found.maps)) {
    const context = contexts[contextOf(path)];
    if (!context) throw new Error(`${path} belongs to a frontend without a di.ts`);
    if (contextOf(path) === "shared") throw new Error(`the frontend context shared hears no other context: it has no context map (${path})`);
    context.map = linesIn(path, map, isLine, "@ingenioz-it/caits/messaging/FrontendContextMap");
  }
  for (const [path, module] of Object.entries(found.handlers)) {
    const context = contexts[contextOf(path)];
    if (!context) throw new Error(`${path} belongs to a frontend without a di.ts`);
    context.useCases.push(useCaseOf(path, module));
  }
  for (const [name, context] of Object.entries(contexts)) {
    if (context.useCases.length > 0 && !context.store) {
      throw new Error(`the frontend ${name} has use cases, but no store to send their input DTOs: it declares one in presentation/store/`);
    }
  }
  return contexts;
}
