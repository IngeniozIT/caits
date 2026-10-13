import { DomainEvent } from "@ingenioz-it/caits/DomainEvent";

/** An event of the context shared: the context map of greetings shares Greeted as this event, for the contexts that hear it. */
export class PersonGreeted extends DomainEvent {
  constructor(readonly name: string) {
    super();
  }
}
