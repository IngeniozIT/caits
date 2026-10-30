import type { DomainEvent } from "../DomainEvent.js";
import { Token } from "../Token.js";
import type { EventSubscriber } from "./EventSubscriber.js";

/**
 * The events that the handlers of a context publish, in every request: a controller that streams a feed writes them. They end when the
 * backend stops: then `signal` aborts, and a feed ends with them.
 */
export type ContextEvents = EventSubscriber<DomainEvent> & { readonly signal: AbortSignal };

export const ContextEvents = new Token<ContextEvents>();
