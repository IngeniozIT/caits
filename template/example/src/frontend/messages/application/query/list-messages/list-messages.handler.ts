import type { EventPublisher } from "@ingeniozit/caits/messaging/EventPublisher";
import type { MessagesEvent } from "#context/application/event/MessagesEvent.js";
import { MessagesLoaded } from "#context/application/event/MessagesLoaded.js";
import { MessagesLoadFailed } from "#context/application/event/MessagesLoadFailed.js";
import type { MessagesGateway } from "#context/domain/port/messages-gateway/MessagesGateway.js";
import type { ListMessagesQuery } from "./list-messages.dto.js";

export class ListMessagesHandler {
  constructor(private readonly gateway: MessagesGateway, private readonly events: EventPublisher<MessagesEvent>) {}

  async execute(_query: ListMessagesQuery): Promise<void> {
    try {
      this.events.publish(new MessagesLoaded(await this.gateway.list()));
    } catch (error) {
      this.events.publish(new MessagesLoadFailed((error as Error).message));
    }
  }
}
