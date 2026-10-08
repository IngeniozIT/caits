import { Input } from "@ingeniozit/caits/messaging/Input";

export class EditMessageCommand extends Input<EditMessageOutput> {
  constructor(readonly id: string, readonly text: string) { super(); }
}
/** The message with its new text, as the domain keeps it. */
export class EditMessageOutput {
  constructor(readonly id: string, readonly text: string) {}
}
