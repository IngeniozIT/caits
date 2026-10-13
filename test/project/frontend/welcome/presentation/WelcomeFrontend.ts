import type { EventPublisher } from "@ingenioz-it/caits/messaging/EventPublisher";
import type { WelcomeShown } from "../application/event/WelcomeShown.js";

/** A context without a store, that tells the other contexts through its context map: its frontend is its bus. */
export type WelcomeFrontend = { events: EventPublisher<WelcomeShown> };

declare module "@ingenioz-it/caits/di/frontend" {
  interface Frontends { welcome: WelcomeFrontend }
}
