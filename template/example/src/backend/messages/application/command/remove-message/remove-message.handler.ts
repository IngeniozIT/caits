import { MessageNotFoundError } from "#context/domain/error/MessageNotFoundError.js";
import type { MessageRepository } from "#context/domain/port/message-repository/MessageRepository.js";
import { RemoveMessageOutput, type RemoveMessageCommand } from "./remove-message.dto.js";

export class RemoveMessageHandler {
  constructor(private readonly messages: MessageRepository) {}

  async execute(command: RemoveMessageCommand): Promise<RemoveMessageOutput> {
    if (!(await this.messages.find(command.id))) throw new MessageNotFoundError(command.id);
    await this.messages.remove(command.id);
    return new RemoveMessageOutput(command.id);
  }
}
