import type { EventPublisher } from "@ingeniozit/caits/messaging/EventPublisher";
import type { MessagesEvent } from "#context/application/event/MessagesEvent.js";
import { MessagesChanged } from "#context/application/event/MessagesChanged.js";
import { MessagesChangeFailed } from "#context/application/event/MessagesChangeFailed.js";
import type { MessagesGateway } from "#context/domain/port/messages-gateway/MessagesGateway.js";
import type { AddMessageCommand } from "./add-message.dto.js";

export class AddMessageHandler {
  constructor(private readonly gateway: MessagesGateway, private readonly events: EventPublisher<MessagesEvent>) {}

  async execute(command: AddMessageCommand): Promise<void> {
    try {
      await this.gateway.add(command.text);
      this.events.publish(new MessagesChanged());
    } catch (error) {
      this.events.publish(new MessagesChangeFailed("addition", (error as Error).message));
    }
  }
}
