import type { Input } from "./Input.js";

export type OutputOf<I> = I extends Input<infer Output> ? Output : never;
type InputClass<I extends Input<unknown>> = abstract new (...args: never[]) => I;

export class UnknownInputError extends Error {
  constructor(readonly inputName: string) {
    super(`No handler subscribes to ${inputName}`);
    this.name = "UnknownInputError";
  }
}

export class DuplicateHandlerError extends Error {
  constructor(readonly inputName: string) {
    super(`A handler already subscribes to ${inputName}`);
    this.name = "DuplicateHandlerError";
  }
}

/** The message bus of one context: each handler subscribes to the class of the input DTO it handles. */
export class MessageBus {
  private handlers = new Map<unknown, (input: never) => unknown>();

  subscribe<I extends Input<unknown>>(input: InputClass<I>, handler: (input: I) => OutputOf<I> | Promise<OutputOf<I>>): void {
    if (this.handlers.has(input)) throw new DuplicateHandlerError(input.name);
    this.handlers.set(input, handler);
  }

  async execute<Output>(input: Input<Output>): Promise<Output> {
    const handler = this.handlers.get(input.constructor);
    if (!handler) throw new UnknownInputError(input.constructor.name);
    return (await handler(input as never)) as Output;
  }
}
