/** An event a context publishes: a fact that the context map may turn into input DTOs of other contexts. The publisher never waits for them. */
export abstract class DomainEvent {
  declare protected readonly fact?: true;
}
