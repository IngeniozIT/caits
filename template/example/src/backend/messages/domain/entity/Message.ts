import { InvalidMessageError } from "#context/domain/error/InvalidMessageError.js";

/** A message: its id, and its text. The text is never empty, and has at most 280 characters, without the spaces around it. */
export class Message {
  static readonly MAX_LENGTH = 280;

  private constructor(readonly id: string, readonly text: string) {}

  /** A new message. The domain refuses a text that is not valid: the error tells the user why. */
  static create(id: string, text: string): Message {
    const trimmed = text.trim();
    if (trimmed === "") throw new InvalidMessageError("A message cannot be empty.");
    if (trimmed.length > Message.MAX_LENGTH) throw new InvalidMessageError(`A message has at most ${Message.MAX_LENGTH} characters.`);
    return new Message(id, trimmed);
  }

  /** A message that was valid when it was kept: an adapter gives it back. */
  static restore(id: string, text: string): Message {
    return new Message(id, text);
  }

  /** The same message, with another text. The text follows the same rules as for a new message. */
  edit(text: string): Message {
    return Message.create(this.id, text);
  }
}
