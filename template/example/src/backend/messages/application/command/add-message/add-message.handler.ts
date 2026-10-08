import { Message } from "#context/domain/entity/Message.js";
import type { MessageRepository } from "#context/domain/port/message-repository/MessageRepository.js";
import { AddMessageOutput, type AddMessageCommand } from "./add-message.dto.js";

export class AddMessageHandler {
  constructor(private readonly messages: MessageRepository) {}

  async execute(command: AddMessageCommand): Promise<AddMessageOutput> {
    const message = Message.create(await this.messages.nextId(), command.text);
    await this.messages.save(message);
    return new AddMessageOutput(message.id, message.text);
  }
}
