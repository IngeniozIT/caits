import { Message } from "#context/domain/entity/Message.js";
import type { MessageRepository } from "#context/domain/port/message-repository/MessageRepository.js";

/** Keeps the messages in memory: the tests use it instead of the file (see test.di.ts). The ids are message-1, message-2… */
export class InMemoryMessageRepository implements MessageRepository {
  private rows: { id: string; text: string }[] = [];
  private ids = 0;

  nextId(): Promise<string> {
    this.ids += 1;
    return Promise.resolve(`message-${this.ids}`);
  }

  list(): Promise<Message[]> {
    return Promise.resolve(this.rows.map(row => Message.restore(row.id, row.text)));
  }

  async find(id: string): Promise<Message | undefined> {
    return (await this.list()).find(message => message.id === id);
  }

  save(message: Message): Promise<void> {
    const row = { id: message.id, text: message.text };
    const index = this.rows.findIndex(candidate => candidate.id === message.id);
    if (index === -1) this.rows.push(row);
    else this.rows[index] = row;
    return Promise.resolve();
  }

  remove(id: string): Promise<void> {
    this.rows = this.rows.filter(row => row.id !== id);
    return Promise.resolve();
  }
}
