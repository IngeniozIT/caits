import { Token } from "../Token.js";

/**
 * Publishes the events of a context: the handlers get it, and the views of the frontend. It cannot subscribe, and it gives nothing back.
 * In the backend, the context map of the context shares them as events of shared, which go later to the other contexts. In the frontend,
 * they go at once to the store of the same context, and its context map shares them.
 */
export interface EventPublisher<E> {
  publish(event: E): void;
}

export const EventPublisher = new Token<EventPublisher<unknown>>();
