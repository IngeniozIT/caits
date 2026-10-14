import type { EventPublisher } from "@ingenioz-it/caits/messaging/EventPublisher";
import type { Greeter } from "../../domain/port/greeter/Greeter.js";
import { Greeted } from "../../domain/event/Greeted.js";
import { GreetOutput, type GreetCommand } from "./greet.dto.js";

export class GreetHandler {
  constructor(private readonly greeter: Greeter, private readonly events: EventPublisher<Greeted>) {}

  execute({ name }: GreetCommand): Promise<GreetOutput> {
    this.events.publish(new Greeted(name));
    return Promise.resolve(new GreetOutput(this.greeter.greet(name)));
  }
}
