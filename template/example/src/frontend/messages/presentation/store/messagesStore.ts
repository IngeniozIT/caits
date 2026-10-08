import type { StoreDefinition } from "@ingeniozit/caits/state/createStore";
import type { Loadable } from "@ingeniozit/caits/state/Loadable";
import { AddMessageCommand } from "#context/application/command/add-message/add-message.dto.js";
import { EditMessageCommand } from "#context/application/command/edit-message/edit-message.dto.js";
import { RemoveMessageCommand } from "#context/application/command/remove-message/remove-message.dto.js";
import type { MessagesChangeFailed } from "#context/application/event/MessagesChangeFailed.js";
import type { MessagesEvent } from "#context/application/event/MessagesEvent.js";
import { ListMessagesQuery } from "#context/application/query/list-messages/list-messages.dto.js";
import type { Message } from "#context/domain/entity/Message.js";

/** An addition, an edition or a removal. */
export type Change = MessagesChangeFailed["change"];

export type MessagesState = {
  messages: Loadable<Message[]>;
  /** The last change that the user asked for. One change at a time: the store sends no other while one is on its way. */
  change: { status: "idle" } | { status: "pending"; change: Change } | { status: "failed"; change: Change; message: string };
};

const pending = (state: MessagesState, change: Change): MessagesState =>
  state.change.status === "pending" ? state : { ...state, change: { status: "pending", change } };

/** The messages store. Once the server made a change, the store asks for the messages again. */
const messagesStore: StoreDefinition<MessagesState, MessagesEvent> = {
  initialState: { messages: { status: "idle" }, change: { status: "idle" } },
  reduce(state, event) {
    switch (event.type) {
      case "messages.requested": return { ...state, messages: { status: "loading" } };
      case "messages.loaded": return { ...state, messages: { status: "loaded", data: event.messages } };
      case "messages.load-failed": return { ...state, messages: { status: "failed", message: event.message } };
      case "messages.addition-requested": return pending(state, "addition");
      case "messages.edition-requested": return pending(state, "edition");
      case "messages.removal-requested": return pending(state, "removal");
      case "messages.changed": return { ...state, change: { status: "idle" } };
      case "messages.change-failed": return { ...state, change: { status: "failed", change: event.change, message: event.message } };
    }
  },
  send(state, event) {
    if (event.type === "messages.requested" || event.type === "messages.changed") return new ListMessagesQuery();
    if (state.change.status === "pending") return undefined;
    if (event.type === "messages.addition-requested") return new AddMessageCommand(event.text);
    if (event.type === "messages.edition-requested") return new EditMessageCommand(event.id, event.text);
    if (event.type === "messages.removal-requested") return new RemoveMessageCommand(event.id);
    return undefined;
  }
};

export default messagesStore;
