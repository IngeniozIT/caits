/** Subscribes to the events of a context: in the frontend, the store gets it; in the backend, the controllers that stream. It cannot publish. */
export interface EventSubscriber<E> {
  subscribe(listener: (event: E) => void): () => void;
}
