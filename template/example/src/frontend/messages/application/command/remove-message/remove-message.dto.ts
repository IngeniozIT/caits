import { Input } from "@ingeniozit/caits/messaging/Input";

/** The store sends it to the message bus: remove a message from the server. */
export class RemoveMessageCommand extends Input<void> {
  constructor(readonly id: string) { super(); }
}
