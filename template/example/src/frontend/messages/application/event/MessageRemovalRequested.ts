/** The View publishes it when the user removes a message. */
export class MessageRemovalRequested {
  readonly type = "messages.removal-requested" as const;
  constructor(readonly id: string) {}
}
