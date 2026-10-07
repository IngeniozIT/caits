import { FrontendEventBus } from "../../messaging/FrontendEventBus.js";
import type { Input } from "../../messaging/Input.js";
import { createStore, type StoreDefinition } from "../../state/createStore.js";
import type { Frontend } from "../../state/request.js";
import { discoveredFrontends } from "../../di/discoveredFrontends.js";
import { frontendsOn, type Frontends } from "../../di/frontend.js";

type StateOf<F> = F extends Frontend<infer S, unknown> ? S : never;
type EventOf<F> = F extends Frontend<unknown, infer E> ? E : never;

/**
 * The presentation of a context, as its views get it: its EventPublisher and its store. The message bus of the store is a Fake: it
 * records the DTOs it receives, and answers nothing. A test publishes the events of the handlers itself.
 */
export function testPresentation<Name extends keyof Frontends>(name: Name): Frontend<StateOf<Frontends[Name]>, EventOf<Frontends[Name]>> & { sent: Input<unknown>[] } {
  const events = new FrontendEventBus<EventOf<Frontends[Name]>>();
  const sent: Input<unknown>[] = [];
  const definition = discoveredFrontends[name].store as StoreDefinition<StateOf<Frontends[Name]>, EventOf<Frontends[Name]>>;
  const store = createStore(definition, { events, bus: { send: <Output>(input: Input<Output>) => { sent.push(input); return Promise.resolve(undefined as Output); } } });
  return { events, store, sent };
}

/** A $global as Marko gives it to the views: the address of the page, and frontends already built. */
export function globalWith(frontends: Partial<Frontends>, url = "http://localhost/"): object {
  const $global = { url: new URL(url) };
  for (const [name, frontend] of Object.entries(frontends)) frontendsOn($global).set(name, frontend);
  return $global;
}
