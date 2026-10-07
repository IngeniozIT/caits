import { EventBus } from "../messaging/EventBus.js";
import { EventPublisher } from "../messaging/EventPublisher.js";
import type { EventSubscriber } from "../messaging/EventSubscriber.js";
import { MessageBus } from "../messaging/MessageBus.js";
import { createStore, type Store } from "../state/createStore.js";
import type { Token } from "../Token.js";
import { bind, Container, type Binding } from "./Container.js";
import type { FrontendModules } from "./discoverFrontends.js";
import { Fetcher } from "./Fetcher.js";

type Handler = new () => { execute(input: unknown): unknown };

/**
 * Builds the frontend of a context: its event bus, its message bus with the handlers of its use cases, its store, and a container with
 * the bindings of its di.ts. The container gives each class what its constructor needs: a handler gets the event bus as its
 * EventPublisher. The store gets it as its EventSubscriber.
 */
function build(context: FrontendModules, fetch: Fetcher, replace: readonly Binding[]) {
  const events = new EventBus<unknown>();
  const container = new Container([bind(Fetcher).toValue(fetch), bind(EventPublisher).toValue(events), ...context.bindings, ...replace]);
  const bus = new MessageBus();
  // A handler is built for each DTO: it always gets the dependencies that the container holds at that time. A dependency that
  // nothing gives is refused now, not when a DTO arrives.
  for (const { input, handler } of context.useCases) {
    container.check(handler as Handler);
    bus.subscribe(input as never, received => container.create(handler as Handler).execute(received) as never);
  }
  return { events, store: createStore(context.store, { events, bus }), bus, container };
}

/** The frontend of a context, as the views get it: the publisher of its events, and the store they subscribe to. */
export function createFrontend(context: FrontendModules, fetch: Fetcher, replace: readonly Binding[] = []): { events: EventPublisher<unknown>; store: Store<unknown> } {
  const { events, store } = build(context, fetch, replace);
  return { events, store };
}

/**
 * The same frontend, with its message bus and its dependencies: the views never get them. The tests of the application send their DTOs
 * to the message bus, subscribe to the events to read what the handlers publish, and read or replace a dependency by its token.
 */
export function createFrontendWithBus(context: FrontendModules, fetch: Fetcher, replace: readonly Binding[] = []) {
  const { events, store, bus, container } = build(context, fetch, replace);
  const subscriber: EventSubscriber<unknown> = events;
  return {
    events: subscriber,
    store,
    bus,
    /** The dependency with this token, built now if no handler needed it before. */
    get: <T>(token: Token<T>): T => container.get(token),
    /** Gives the dependency that the handlers use from now on, in place of the one the bindings build. */
    use: <T, Given extends T>(token: Token<T>, value: Given): Given => container.use(token, value)
  };
}
