import { Message } from "#context/domain/entity/Message.js";
import type { MessagesGateway } from "#context/domain/port/messages-gateway/MessagesGateway.js";

/** Stands for the server in the tests (see test.di.ts). The messages it adds get the ids message-1, message-2… */
export class FakeMessagesGateway implements MessagesGateway {
  private held: Message[];
  private added = 0;
  private failure: string | undefined;
  private refusal: string | undefined;

  constructor(messages: Message[] = []) { this.held = [...messages]; }

  /** From now on, listing the messages fails with this message. */
  failWith(message: string): void { this.failure = message; }

  /** From now on, every change is refused, for this reason. */
  refuseWith(reason: string): void { this.refusal = reason; }

  list(): Promise<Message[]> {
    return this.failure === undefined ? Promise.resolve([...this.held]) : Promise.reject(new Error(this.failure));
  }

  add(text: string): Promise<void> {
    return this.change(() => {
      this.added += 1;
      this.held = [...this.held, new Message(`message-${this.added}`, text)];
    });
  }

  edit(id: string, text: string): Promise<void> {
    return this.change(() => { this.held = this.held.map(message => message.id === id ? new Message(id, text) : message); });
  }

  remove(id: string): Promise<void> {
    return this.change(() => { this.held = this.held.filter(message => message.id !== id); });
  }

  private change(apply: () => void): Promise<void> {
    if (this.refusal !== undefined) return Promise.reject(new Error(this.refusal));
    apply();
    return Promise.resolve();
  }
}
