import type { MessageBus } from "./MessageBus.js";

type InputClass<I> = abstract new (...args: never[]) => I;

export class UnknownInputError extends Error {
  constructor(readonly inputName: string) {
    super(`No handler takes ${inputName}: write one next to its DTO, in <use-case>.handler.ts, with execute(input: ${inputName})`);
    this.name = "UnknownInputError";
  }
}

export class DuplicateHandlerError extends Error {
  constructor(readonly inputName: string) {
    super(`A handler already subscribes to ${inputName}`);
    this.name = "DuplicateHandlerError";
  }
}

/** The message bus of one context, in the process: each handler subscribes to the class of the input DTO it handles. */
export class InProcessMessageBus implements MessageBus {
  private handlers = new Map<unknown, (input: never) => unknown>();

  subscribe<I extends object>(input: InputClass<I>, handler: (input: I) => unknown): void {
    if (this.handlers.has(input)) throw new DuplicateHandlerError(input.name);
    this.handlers.set(input, handler);
  }

  async send(input: object): Promise<unknown> {
    const handler = this.handlers.get(input.constructor);
    if (!handler) throw new UnknownInputError(input.constructor.name);
    return await handler(input as never);
  }
}
