import { describe, expect, test } from "vitest";
import { DuplicateHandlerError, InProcessMessageBus, UnknownInputError } from "./InProcessMessageBus.js";

class Double { constructor(readonly value: number) {} }
class Greet {}

describe("a message bus", () => {
  test("hands an input to the handler that subscribes to its class, and answers what the handler answers", async () => {
    const bus = new InProcessMessageBus();
    bus.subscribe(Double, input => input.value * 2);
    bus.subscribe(Greet, async () => "hello");

    expect(await bus.send(new Double(4))).toBe(8);
    expect(await bus.send(new Greet())).toBe("hello");
  });

  test("refuses an input nobody handles, and names its class", async () => {
    const error = await new InProcessMessageBus().send(new Greet()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnknownInputError);
    expect(error).toMatchObject({ name: "UnknownInputError", inputName: "Greet", message: "No handler takes Greet: write one next to its DTO, in <use-case>.handler.ts, with execute(input: Greet)" });
  });

  test("refuses a second handler for the same input, names it, and keeps the first", async () => {
    const bus = new InProcessMessageBus();
    bus.subscribe(Greet, () => "first");
    const attempt = () => { bus.subscribe(Greet, () => "second"); };
    expect(attempt).toThrow(DuplicateHandlerError);
    expect(attempt).toThrow(expect.objectContaining({ name: "DuplicateHandlerError", inputName: "Greet", message: "A handler already subscribes to Greet" }));
    expect(await bus.send(new Greet())).toBe("first");
  });
});
