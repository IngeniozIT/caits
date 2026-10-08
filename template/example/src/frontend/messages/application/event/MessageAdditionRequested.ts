/** The View publishes it when the user adds a message. */
export class MessageAdditionRequested {
  readonly type = "messages.addition-requested" as const;
  constructor(readonly text: string) {}
}
