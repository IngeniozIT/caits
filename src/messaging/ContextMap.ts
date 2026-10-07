import type { DomainEvent } from "../DomainEvent.js";
import type { Input } from "./Input.js";

/** What the shared bus adds to an event it carries: an id of its own, and the correlation id of the request that published it. */
export type Envelope = { readonly eventId: string; readonly correlationId: string };

type EventClass<E> = abstract new (...args: never[]) => E;

export type Translation = { readonly event: EventClass<DomainEvent>; readonly inputs: (event: never, envelope: Envelope) => Input<unknown>[] };

/** One line of the context map: an event of a context becomes input DTOs, for whichever contexts handle them. */
export function when<E extends DomainEvent>(event: EventClass<E>, inputs: (event: E, envelope: Envelope) => Input<unknown>[]): Translation {
  return { event, inputs };
}

export class ContextMap {
  constructor(private readonly translations: Translation[]) {}

  inputsFor(event: DomainEvent, envelope: Envelope): Input<unknown>[] {
    return this.translations.filter(translation => event instanceof translation.event).flatMap(translation => translation.inputs(event as never, envelope));
  }
}
