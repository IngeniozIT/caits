import { Input } from "@ingeniozit/caits/messaging/Input";

/** The store sends it to the message bus: add a message on the server. */
export class AddMessageCommand extends Input<void> {
  constructor(readonly text: string) { super(); }
}
