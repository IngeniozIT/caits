/** An input DTO of a context, a command or a query. `Output` is the DTO its handler answers with. */
export abstract class Input<Output> {
  declare protected readonly output?: Output;
}
