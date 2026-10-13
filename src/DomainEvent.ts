/**
 * An event a context publishes: a fact of the context, that its context map may share as an event of the context shared, which the
 * context maps of the other contexts turn into input DTOs of their own. The publisher never waits for them.
 */
export abstract class DomainEvent {
  declare protected readonly fact?: true;
}
