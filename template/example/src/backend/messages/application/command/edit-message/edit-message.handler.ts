import { MessageNotFoundError } from "#context/domain/error/MessageNotFoundError.js";
import type { MessageRepository } from "#context/domain/port/message-repository/MessageRepository.js";
import { EditMessageOutput, type EditMessageCommand } from "./edit-message.dto.js";

export class EditMessageHandler {
  constructor(private readonly messages: MessageRepository) {}

  async execute(command: EditMessageCommand): Promise<EditMessageOutput> {
    const message = await this.messages.find(command.id);
    if (!message) throw new MessageNotFoundError(command.id);
    const edited = message.edit(command.text);
    await this.messages.save(edited);
    return new EditMessageOutput(edited.id, edited.text);
  }
}
