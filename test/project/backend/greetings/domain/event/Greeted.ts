import { DomainEvent } from "caits/DomainEvent";

export class Greeted extends DomainEvent {
  constructor(readonly name: string) {
    super();
  }
}
