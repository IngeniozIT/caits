import { describe, expect, test } from "vitest";
import { DomainEvent } from "../DomainEvent.js";
import { ContextMap, share, when } from "./ContextMap.js";

class Rang extends DomainEvent { constructor(readonly times: number) { super(); } }
class RangLoudly extends Rang {}
class Asked extends DomainEvent {}
class Listen { constructor(readonly times: number, readonly eventId: string) {} }
class Count {}
class Write { constructor(readonly text: string) {} }
class Heard extends DomainEvent { constructor(readonly times: number) { super(); } }

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

  test("turns an event of its context into the events of shared of every line that shares it", () => {
    const map = new ContextMap([
      share(Rang, event => [new Heard(event.times)]),
      share(Rang, event => [new Heard(event.times + 1), new Asked()])
    ]);
    expect(map.eventsFor(new RangLoudly(2))).toEqual([new Heard(2), new Heard(3), new Asked()]);
    expect(map.eventsFor(new Asked())).toEqual([]);
  });

  test("a line hears or shares, never both: the kernel reads the first on the shared bus, the second on the events of the context", () => {
    const map = new ContextMap([when(Rang, event => [new Count(), new Listen(event.times, "")]), share(Asked, () => [new Heard(1)])]);
    expect(map.eventsFor(new Rang(1))).toEqual([]);
    expect(map.inputsFor(new Asked(), envelope)).toEqual([]);
    expect(when(Rang, () => [])).toMatchObject({ shares: false, event: Rang });
    expect(share(Asked, () => [])).toMatchObject({ shares: true, event: Asked });
  });
});
