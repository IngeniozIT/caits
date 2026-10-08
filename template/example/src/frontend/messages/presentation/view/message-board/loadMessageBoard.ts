import { settled } from "@ingeniozit/caits/state/Loadable";
import { request } from "@ingeniozit/caits/state/request";
import { MessagesRequested } from "#context/application/event/MessagesRequested.js";
import type { MessagesFrontend } from "#context/presentation/MessagesFrontend.js";
import { listOf, type MessageList } from "./presentMessageBoard.js";

/** When the board loads, it asks for the messages. On the server, the page then holds them in its HTML. */
export async function loadMessageBoard(frontend: MessagesFrontend): Promise<MessageList> {
  return listOf(await request(frontend, new MessagesRequested(), state => settled(state.messages)));
}
