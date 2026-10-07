import type { Input } from "../messaging/Input.js";
import type { EventSubscriber } from "../messaging/EventSubscriber.js";

/** How the store of a frontend context reacts to each event of its event bus. */
export interface StoreDefinition<S, E> {
  initialState: S;
  /** The state after the event. */
  reduce(state: S, event: E): S;
  /** The input DTO that the event asks the store to send to the message bus, or undefined. It reads the state before the event. */
  send(state: S, event: E): Input<unknown> | undefined;
}

export interface Store<S> {
  getState(): S;
  subscribe(listener: (state: S) => void): () => void;
  subscriberCount(): number;
}

export type StoreLinks<E> = {
  events: EventSubscriber<E>;
  bus: { execute(input: Input<unknown>): Promise<unknown> };
  reportError?: (error: unknown) => void;
};

/** The store receives every event of the event bus: it keeps the state that the views subscribe to, and sends the input DTOs that the events ask for. */
export function createStore<S, E>(definition: StoreDefinition<S, E>, { events, bus, reportError = error => console.error(error) }: StoreLinks<E>): Store<S> {
  let state = definition.initialState;
  const listeners = new Set<(state: S) => void>();
  events.subscribe(event => {
    const input = definition.send(state, event);
    state = definition.reduce(state, event);
    for (const listener of [...listeners]) listener(state);
    if (input) bus.execute(input).catch(reportError);
  });
  return {
    getState: () => state,
    subscriberCount: () => listeners.size,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    }
  };
}
