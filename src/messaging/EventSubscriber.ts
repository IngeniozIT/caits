/** Subscribes to the events of a frontend context: the store gets it. It cannot publish. */
export interface EventSubscriber<E> {
  subscribe(listener: (event: E) => void): () => void;
}
