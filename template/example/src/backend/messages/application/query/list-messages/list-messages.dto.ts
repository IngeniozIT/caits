import { Input } from "@ingeniozit/caits/messaging/Input";

export class ListMessagesQuery extends Input<ListMessagesOutput> {}
/** The messages, in the order they were added. */
export class ListMessagesOutput {
  constructor(readonly messages: { id: string; text: string }[]) {}
}
