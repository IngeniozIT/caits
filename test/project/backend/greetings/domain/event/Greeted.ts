import { DomainEvent } from "@ingeniozit/caits/DomainEvent";

export class Greeted extends DomainEvent {
  constructor(readonly name: string) {
    super();
  }
}
