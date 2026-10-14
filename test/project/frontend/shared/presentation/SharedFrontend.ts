import type { EventPublisher } from "@ingenioz-it/caits/messaging/EventPublisher";
import type { SharedEvent } from "../event/SharedEvent.js";

/** The context shared has no store: its frontend is the shared bus, where its components publish its events, and the context maps of the other contexts share theirs. */
export type SharedFrontend = { events: EventPublisher<SharedEvent> };

declare module "@ingenioz-it/caits/di/frontend" {
  interface Frontends { shared: SharedFrontend }
}
