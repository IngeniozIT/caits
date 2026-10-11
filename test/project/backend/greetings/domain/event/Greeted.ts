import { DomainEvent } from "@ingenioz-it/caits/DomainEvent";

export class Greeted extends DomainEvent {
  constructor(readonly name: string) {
    super();
  }
}
