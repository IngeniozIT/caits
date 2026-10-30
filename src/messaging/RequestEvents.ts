import type { DomainEvent } from "../DomainEvent.js";
import { Token } from "../Token.js";
import type { EventSubscriber } from "./EventSubscriber.js";

/** The events that the handlers of a request publish, as they publish them: a controller that streams writes them in its response. */
export type RequestEvents = EventSubscriber<DomainEvent>;

export const RequestEvents = new Token<RequestEvents>();
