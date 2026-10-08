/** The handler publishes it when the server cannot give the messages. */
export class MessagesLoadFailed {
  readonly type = "messages.load-failed" as const;
  constructor(readonly message: string) {}
}
