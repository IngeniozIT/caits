type EventClass<E> = abstract new (...args: never[]) => E;

/**
 * One line of the context map of a frontend context: an event of the context shared that it hears, which becomes events of the context,
 * or an event of the context that it shares, which becomes events of the context shared.
 */
export type Line = { readonly shares: boolean; readonly event: EventClass<object>; readonly events: (event: never) => object[] };

/**
 * A line that hears the context shared, in the context map of a frontend context (its context-map.ts): when this event of shared comes
 * on the shared bus, the context publishes these events of its own on its own bus, and its store reads them. A context map names only
 * its own context and the context shared: two contexts never name each other.
 */
export function when<E extends object>(event: EventClass<E>, events: (event: E) => object[]): Line {
  return { shares: false, event, events };
}

/**
 * A line that tells the other contexts: when a view, a component or a handler of the context publishes this event of its own on its
 * bus, the context publishes these events of shared on the shared bus, and the context map of each context that hears them turns them
 * into events of its own. The event of the context holds what the events of shared need.
 */
export function share<E extends object>(event: EventClass<E>, events: (event: E) => object[]): Line {
  return { shares: true, event, events };
}

/**
 * The events that a map gives for an event, line by line, none when no line reads it: for an event of shared that it hears, events of
 * the context; for an event of the context that it shares, events of shared.
 */
export function eventsFor(map: readonly Line[], event: object): object[] {
  return map.filter(line => event instanceof line.event).flatMap(line => line.events(event as never));
}
