import type { Frontend } from "@ingeniozit/caits/state/request";
import type { MessagesEvent } from "#context/application/event/MessagesEvent.js";
import type { MessagesState } from "./store/messagesStore.js";

/** What a View of the context gets: the events it publishes, and the store it reads. */
export type MessagesFrontend = Frontend<MessagesState, MessagesEvent>;

declare module "@ingeniozit/caits/di/frontend" {
  interface Frontends { messages: MessagesFrontend }
}
