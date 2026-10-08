/** The View publishes it when the user saves the new text of a message. */
export class MessageEditionRequested {
  readonly type = "messages.edition-requested" as const;
  constructor(readonly id: string, readonly text: string) {}
}
