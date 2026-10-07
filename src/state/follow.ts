import type { Store } from "./createStore.js";

/** A view follows the store: it shows what the current state presents, then what each new state presents, until it calls the returned stop. */
export function follow<S, V>(store: Store<S>, present: (state: S) => V, show: (view: V) => void): () => void {
  show(present(store.getState()));
  return store.subscribe(state => { show(present(state)); });
}
