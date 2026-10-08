import { Input } from "@ingeniozit/caits/messaging/Input";

/** The store sends it to the message bus: give a message of the server a new text. */
export class EditMessageCommand extends Input<void> {
  constructor(readonly id: string, readonly text: string) { super(); }
}
