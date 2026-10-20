import type { DomainEvent } from "../DomainEvent.js";

/** What the shared bus adds to an event it carries: an id of its own, and the correlation id of the request that published it. */
export type Envelope = { readonly eventId: string; readonly correlationId: string };

type EventClass<E> = abstract new (...args: never[]) => E;

/**
 * One line of the context map of a backend context (its context-map.ts): an event of the context shared that it hears, which becomes
 * input DTOs of the context, or an event of the context that it shares, which becomes events of the context shared.
 */
export type Translation =
  | { readonly shares: false; readonly event: EventClass<DomainEvent>; readonly inputs: (event: never, envelope: Envelope) => object[] }
  | { readonly shares: true; readonly event: EventClass<DomainEvent>; readonly events: (event: never) => DomainEvent[] };

/**
 * A line that hears the context shared: when this event of shared comes on the shared bus, the handlers of the context execute these
 * input DTOs. A context map names only its own context and the context shared: two contexts never name each other.
 */
export function when<E extends DomainEvent>(event: EventClass<E>, inputs: (event: E, envelope: Envelope) => object[]): Translation {
  return { shares: false, event, inputs };
}

/**
 * A line that tells the other contexts: when a handler of the context publishes this event of its own, the context publishes these
 * events of shared on the shared bus, and the context map of each context that hears them turns them into inputs of its own. The event
 * of the context holds what the events of shared need.
 */
export function share<E extends DomainEvent>(event: EventClass<E>, events: (event: E) => DomainEvent[]): Translation {
  return { shares: true, event, events };
}

export class ContextMap {
  constructor(private readonly translations: Translation[]) {}

  /** The input DTOs that the lines that hear this event of shared give, none when no line hears it. */
  inputsFor(event: DomainEvent, envelope: Envelope): object[] {
    return this.translations.flatMap(translation => !translation.shares && event instanceof translation.event ? translation.inputs(event as never, envelope) : []);
  }

  /** The events of shared that the lines that share this event of the context give, none when no line shares it. */
  eventsFor(event: DomainEvent): DomainEvent[] {
    return this.translations.flatMap(translation => translation.shares && event instanceof translation.event ? translation.events(event as never) : []);
  }
}
