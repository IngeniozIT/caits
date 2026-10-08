/** A handler publishes it when the server refuses a change, or cannot be reached. */
export class MessagesChangeFailed {
  readonly type = "messages.change-failed" as const;
  constructor(readonly change: "addition" | "edition" | "removal", readonly message: string) {}
}
