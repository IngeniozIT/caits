import { Input } from "@ingeniozit/caits/messaging/Input";

export class AddMessageCommand extends Input<AddMessageOutput> {
  constructor(readonly text: string) { super(); }
}
/** The message that was added, as the domain keeps it. */
export class AddMessageOutput {
  constructor(readonly id: string, readonly text: string) {}
}
