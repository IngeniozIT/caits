import { settled, type Settled } from "@ingeniozit/caits/state/Loadable";
import type { Message } from "#context/domain/entity/Message.js";
import type { Change, MessagesState } from "#context/presentation/store/messagesStore.js";

/** The messages that the board lists, as plain data that Marko can send to the browser, or why it could not load them. */
export type MessageList = { messages: { id: string; text: string }[]; failure: string | undefined };

export type MessageBoardViewModel = {
  list?: MessageList;
  /** The change on its way, if any: the buttons wait for it. */
  pending: Change | undefined;
  /** Why the server refused the last addition: the form of the addition shows it. */
  additionError: string | undefined;
  /** Why the server refused the last edition or removal: the board shows it above the list. */
  changeError: string | undefined;
};

export const listOf = (messages: Settled<Message[]>): MessageList =>
  messages.status === "loaded" ? { messages: messages.data.map(({ id, text }) => ({ id, text })), failure: undefined } : { messages: [], failure: messages.message };

/** What the board shows of the store. */
export function presentMessageBoard(state: MessagesState): MessageBoardViewModel {
  const loaded = settled(state.messages);
  const list = loaded && listOf(loaded);
  const { change } = state;
  return {
    list,
    pending: change.status === "pending" ? change.change : undefined,
    additionError: change.status === "failed" && change.change === "addition" ? change.message : undefined,
    changeError: change.status === "failed" && change.change !== "addition" ? change.message : undefined
  };
}

export const idleMessageBoardViewModel = presentMessageBoard({ messages: { status: "idle" }, change: { status: "idle" } });
