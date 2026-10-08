import type { MessageRepository } from "#context/domain/port/message-repository/MessageRepository.js";
import { ListMessagesOutput, type ListMessagesQuery } from "./list-messages.dto.js";

export class ListMessagesHandler {
  constructor(private readonly messages: MessageRepository) {}

  async execute(_query: ListMessagesQuery): Promise<ListMessagesOutput> {
    return new ListMessagesOutput((await this.messages.list()).map(({ id, text }) => ({ id, text })));
  }
}
