import { describe, expect, test } from "vitest";
import { Input } from "./Input.js";
import { DuplicateHandlerError, MessageBus, UnknownInputError } from "./MessageBus.js";

class Double extends Input<number> { constructor(readonly value: number) { super(); } }
class Greet extends Input<string> {}

describe("a message bus", () => {
  test("hands an input to the handler that subscribes to its class, and answers what the handler answers", async () => {
    const bus = new MessageBus();
    bus.subscribe(Double, input => input.value * 2);
    bus.subscribe(Greet, async () => "hello");

    expect(await bus.execute(new Double(4))).toBe(8);
    expect(await bus.execute(new Greet())).toBe("hello");
  });

  test("refuses an input nobody handles, and names its class", async () => {
    const error = await new MessageBus().execute(new Greet()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnknownInputError);
    expect(error).toMatchObject({ name: "UnknownInputError", inputName: "Greet", message: "No handler subscribes to Greet" });
  });

  test("refuses a second handler for the same input, names it, and keeps the first", async () => {
    const bus = new MessageBus();
    bus.subscribe(Greet, () => "first");
    const attempt = () => { bus.subscribe(Greet, () => "second"); };
    expect(attempt).toThrow(DuplicateHandlerError);
    expect(attempt).toThrow(expect.objectContaining({ name: "DuplicateHandlerError", inputName: "Greet", message: "A handler already subscribes to Greet" }));
    expect(await bus.execute(new Greet())).toBe("first");
  });
});
