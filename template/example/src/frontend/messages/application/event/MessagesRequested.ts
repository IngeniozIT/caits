/** The View publishes it when it needs the messages. */
export class MessagesRequested {
  readonly type = "messages.requested" as const;
}
