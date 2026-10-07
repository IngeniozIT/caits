import { Token } from "../Token.js";

/**
 * Publishes the events of a context: the handlers get it, and the views of the frontend. It cannot subscribe, and it gives nothing back.
 * In the backend, the events go later to the other contexts, through the context map. In the frontend, they go at once to the store of
 * the same context.
 */
export interface EventPublisher<E> {
  publish(event: E): void;
}

export const EventPublisher = new Token<EventPublisher<unknown>>();
