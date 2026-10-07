import { describe, expect, test } from "vitest";
import { DomainEvent } from "../DomainEvent.js";
import { ContextMap, when } from "./ContextMap.js";
import { Input } from "./Input.js";

class Rang extends DomainEvent { constructor(readonly times: number) { super(); } }
class RangLoudly extends Rang {}
class Asked extends DomainEvent {}
class Listen extends Input<string> { constructor(readonly times: number, readonly eventId: string) { super(); } }
class Count extends Input<number> {}
class Write extends Input<void> { constructor(readonly text: string) { super(); } }

const envelope = { eventId: "e1", correlationId: "c1" };

describe("a context map", () => {
  test("turns an event into the inputs of every line about its class, with what the envelope says", () => {
    const map = new ContextMap([
      when(Rang, (event, { eventId }) => [new Listen(event.times, eventId)]),
      when(Rang, event => [new Write(`rang ${event.times}`)])
    ]);
    expect(map.inputsFor(new Rang(2), envelope)).toEqual([new Listen(2, "e1"), new Write("rang 2")]);
  });

  test("an event of a more precise class is also one of its parent class", () => {
    const map = new ContextMap([when(Rang, event => [new Write(`rang ${event.times}`)])]);
    expect(map.inputsFor(new RangLoudly(3), envelope)).toEqual([new Write("rang 3")]);
  });

  test("an event no line is about goes nowhere", () => {
    expect(new ContextMap([when(Asked, () => [new Count()])]).inputsFor(new Rang(1), envelope)).toEqual([]);
  });
});
