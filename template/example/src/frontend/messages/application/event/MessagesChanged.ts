/** A handler publishes it when the server made a change: an addition, an edition or a removal. */
export class MessagesChanged {
  readonly type = "messages.changed" as const;
}
