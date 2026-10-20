import { FrontendEventBus } from "../../messaging/FrontendEventBus.js";
import { createStore, type StoreDefinition } from "../../state/createStore.js";
import type { EventPublisher } from "../../messaging/EventPublisher.js";
import { discoveredFrontends } from "../../di/discoveredFrontends.js";
import { frontendsOn, type Frontends } from "../../di/frontend.js";

type EventOf<F> = F extends { events: EventPublisher<infer E> } ? E : never;
type StoreOf<F> = F extends { store: infer S } ? S : undefined;

/** The presentation of a context in a test: its frontend, the DTOs that its store sent, and the events that it published. */
export type TestPresentation<F> = { events: EventPublisher<EventOf<F>>; store: StoreOf<F>; sent: object[]; published: EventOf<F>[] };

/**
 * The presentation of a context, as its views and its components get it: its EventPublisher and its store (none, for a context
 * without a store). The message bus of the store is a Fake: it records the DTOs it receives in `sent`, and answers nothing. A test
 * publishes the events of the handlers itself. `published` records every event of the bus, in their order: those that the views and
 * the components publish. The context map is left aside: its own test reads what it shares.
 */
export function testPresentation<Name extends keyof Frontends>(name: Name): TestPresentation<Frontends[Name]> {
  const events = new FrontendEventBus<EventOf<Frontends[Name]>>();
  const sent: object[] = [];
  const published: EventOf<Frontends[Name]>[] = [];
  events.subscribe(event => { published.push(event); });
  const definition = discoveredFrontends[name].store as StoreDefinition<unknown, EventOf<Frontends[Name]>> | undefined;
  const store = definition && createStore(definition, { events, bus: { send: (input: object) => { sent.push(input); return Promise.resolve(undefined); } } });
  return { events, store, sent, published } as unknown as TestPresentation<Frontends[Name]>;
}

/** A $global as Marko gives it to the views: the address of the page, and frontends already built. */
export function globalWith(frontends: Partial<Frontends>, url = "http://localhost/"): object {
  const $global = { url: new URL(url) };
  for (const [name, frontend] of Object.entries(frontends)) frontendsOn($global).set(name, frontend);
  return $global;
}
