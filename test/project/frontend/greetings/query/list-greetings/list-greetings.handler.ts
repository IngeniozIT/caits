import type { EventPublisher } from "@ingenioz-it/caits/messaging/EventPublisher";
import type { GreetingsGateway } from "../../domain/port/greetings-gateway/GreetingsGateway.js";
import { GreetingsLoaded } from "../../event/GreetingsLoaded.js";
import type { GreetingsEvent } from "../../event/GreetingsEvent.js";
import type { ListGreetingsQuery } from "./list-greetings.dto.js";

export class ListGreetingsHandler {
  constructor(private readonly gateway: GreetingsGateway, private readonly events: EventPublisher<GreetingsEvent>) {}

  async execute(_query: ListGreetingsQuery): Promise<void> {
    this.events.publish(new GreetingsLoaded(await this.gateway.list()));
  }
}
