import { describe, expect, test } from "vitest";
import { FakeMessageBus } from "./FakeMessageBus.js";

class Ask { constructor(readonly value: number) {} }
class Nested { constructor(readonly content: { tags: string[]; at: Date }) {} }
class Sparse { constructor(fields: Record<string, unknown>) { Object.assign(this, fields); } }
class Impostor { constructor(readonly value: number) {} }

describe("a fake message bus", () => {
  test("answers an expected message with what it was told", async () => {
    const bus = new FakeMessageBus();
    bus.expect(new Ask(1));
    bus.replyToTheLast("one");
    await expect(bus.execute(new Ask(1))).resolves.toBe("one");
    expect(() => bus.verify()).not.toThrow();
  });

  test("fails an expected message with the error it was told", async () => {
    const bus = new FakeMessageBus();
    bus.expect(new Ask(1));
    bus.failTheLast(new Error("refused"));
    await expect(bus.execute(new Ask(1))).rejects.toThrow("refused");
    expect(() => bus.verify()).not.toThrow();
  });

  test("gives each answer to the message it was announced for, whatever the order they come in", async () => {
    const bus = new FakeMessageBus();
    bus.expect(new Ask(1));
    bus.replyToTheLast("one");
    bus.expect(new Ask(2));
    bus.failTheLast(new Error("two refused"));
    await expect(bus.execute(new Ask(2))).rejects.toThrow("two refused");
    await expect(bus.execute(new Ask(1))).resolves.toBe("one");
    expect(() => bus.verify()).not.toThrow();
  });

  test("refuses a message nobody expected, says what it was, and fails when verified", async () => {
    const bus = new FakeMessageBus();
    bus.expect(new Ask(1));
    bus.replyToTheLast("one");
    await expect(bus.execute(new Ask(2))).rejects.toThrow('nobody expected: Ask {"value":2} (still expected: {"value":1})');
    expect(() => bus.verify()).toThrow('messages the application sent although nobody expected them: [{"value":2}]');
  });

  test("a message of another class with the same fields is not the expected one", async () => {
    const bus = new FakeMessageBus();
    bus.expect(new Ask(1));
    bus.replyToTheLast("one");
    await expect(bus.execute(new Impostor(1))).rejects.toThrow("nobody expected");
  });

  test("an expected message that was never sent is reported", () => {
    const bus = new FakeMessageBus();
    bus.expect(new Ask(1));
    expect(() => bus.verify()).toThrow('messages the application was expected to send: [{"value":1}]');
  });

  test("a message is expected as many times as it was announced", async () => {
    const bus = new FakeMessageBus();
    bus.expect(new Ask(1));
    bus.replyToTheLast("one");
    await bus.execute(new Ask(1));
    await expect(bus.execute(new Ask(1))).rejects.toThrow("nobody expected");
  });

  test("an expected message that is sent without anything prepared for its answer fails, and says so", async () => {
    const bus = new FakeMessageBus();
    bus.expect(new Ask(1));
    await expect(bus.execute(new Ask(1))).rejects.toThrow("Nothing is prepared for the application to be answered: Ask");
    expect(() => bus.verify()).not.toThrow();
  });

  test("an answer needs a message expected before it", () => {
    const bus = new FakeMessageBus();
    expect(() => bus.replyToTheLast("one")).toThrow("Say which message is expected before saying how the application replies.");
    expect(() => bus.failTheLast(new Error("x"))).toThrow("before saying how the application fails.");
  });

  test("messages are compared by their content, down to nested values and dates", async () => {
    const bus = new FakeMessageBus();
    const at = (day: number) => new Date(Date.UTC(2026, 0, day));
    bus.expect(new Nested({ tags: ["a", "b"], at: at(1) }));
    bus.replyToTheLast("one");
    await expect(bus.execute(new Nested({ tags: ["a", "c"], at: at(1) }))).rejects.toThrow("nobody expected");
    await expect(bus.execute(new Nested({ tags: ["a", "b"], at: at(2) }))).rejects.toThrow("nobody expected");
    await expect(bus.execute(new Nested({ tags: ["a"], at: at(1) }))).rejects.toThrow("nobody expected");
    await expect(bus.execute(new Nested({ tags: ["a", "b"], at: at(1) }))).resolves.toBe("one");
  });

  test("a message with more fields than the expected one is not the expected one", async () => {
    const bus = new FakeMessageBus();
    bus.expect(new Sparse({ a: 1 }));
    bus.replyToTheLast("one");
    await expect(bus.execute(new Sparse({ a: 1, b: 2 }))).rejects.toThrow("nobody expected");
    await expect(bus.execute(new Sparse({ a: 1 }))).resolves.toBe("one");
  });

  test("an unexpected message lists only the messages still expected, separated by commas, or says there are none", async () => {
    const bus = new FakeMessageBus();
    await expect(bus.execute(new Ask(9))).rejects.toThrow('(still expected: none)');
    bus.expect(new Ask(1));
    bus.replyToTheLast("one");
    bus.expect(new Ask(2));
    bus.replyToTheLast("two");
    bus.expect(new Ask(3));
    bus.replyToTheLast("three");
    await bus.execute(new Ask(1));
    await expect(bus.execute(new Ask(9))).rejects.toThrow('(still expected: {"value":2}, {"value":3})');
  });

  test("verifying reports on separate lines both what was unexpected and what never came", async () => {
    const bus = new FakeMessageBus();
    bus.expect(new Ask(1));
    await bus.execute(new Ask(2)).catch(() => undefined);
    expect(() => bus.verify()).toThrow(
      'messages the application sent although nobody expected them: [{"value":2}]\n' +
      'messages the application was expected to send: [{"value":1}]'
    );
  });
});
