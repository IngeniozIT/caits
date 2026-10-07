import { DomainEvent } from "@ingeniozits/kernel/DomainEvent";

export class Greeted extends DomainEvent {
  constructor(readonly name: string) {
    super();
  }
}
