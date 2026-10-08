import { Input } from "@ingeniozit/caits/messaging/Input";

export class RemoveMessageCommand extends Input<RemoveMessageOutput> {
  constructor(readonly id: string) { super(); }
}
/** The id of the message that was removed. */
export class RemoveMessageOutput {
  constructor(readonly id: string) {}
}
