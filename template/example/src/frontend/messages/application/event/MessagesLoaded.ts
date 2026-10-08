import type { Message } from "#context/domain/entity/Message.js";

/** The handler publishes it with the messages that the server gave. */
export class MessagesLoaded {
  readonly type = "messages.loaded" as const;
  constructor(readonly messages: Message[]) {}
}
