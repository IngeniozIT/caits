import type { EventPublisher } from "../messaging/EventPublisher.js";
import type { Store } from "./createStore.js";

/** What a view holds of a frontend context: the EventPublisher it publishes on, and the store it subscribes to. */
export interface Frontend<S, E> {
  events: EventPublisher<E>;
  store: Store<S>;
}

/** A view asks for something: it publishes the event, then waits for the first state in which `answer` finds the answer. */
export function request<S, E, T>({ events, store }: Frontend<S, E>, event: E, answer: (state: S) => T | undefined): Promise<T> {
  return new Promise(resolve => {
    const stop = store.subscribe(state => {
      const found = answer(state);
      if (found === undefined) return;
      stop();
      resolve(found);
    });
    events.publish(event);
  });
}
