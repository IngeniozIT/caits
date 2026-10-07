import { describe, expect, test } from "vitest";
import { DomainEvent } from "../DomainEvent.js";
import { ContextMap, when, type Envelope } from "./ContextMap.js";
import { Input } from "./Input.js";
import { BackendEventBus } from "./BackendEventBus.js";

class Rang extends DomainEvent { constructor(readonly times: number) { super(); } }
class Fell extends DomainEvent {}
class Listen extends Input<string> { constructor(readonly times: number) { super(); } }
class Write extends Input<string> { constructor(readonly text: string) { super(); } }
class Explode extends DomainEvent {}

function eventBus(send: (input: Input<unknown>, envelope: Envelope) => Promise<unknown> = async input => `done: ${JSON.stringify(input)}`) {
  const reported: unknown[] = [];
  const sent: [Input<unknown>, Envelope][] = [];
  let ids = 0;
  const bus = new BackendEventBus({
    map: new ContextMap([
      when(Rang, event => [new Listen(event.times), new Write(`rang ${event.times}`)]),
      when(Explode, () => { throw new Error("map down"); })
    ]),
    send: (input, envelope) => { sent.push([input, envelope]); return send(input, envelope); },
    nextEventId: () => `e${++ids}`,
    reportError: error => { reported.push(error); }
  });
  return { bus, reported, sent };
}

describe("a shared bus", () => {
  test("sends the inputs the map makes of an event, in an envelope of its own", async () => {
    const { bus, sent } = eventBus();
    bus.publish(new Rang(2), { correlationId: "c1" });
    await bus.settled();
    expect(sent).toEqual([[new Listen(2), { eventId: "e1", correlationId: "c1" }], [new Write("rang 2"), { eventId: "e1", correlationId: "c1" }]]);
  });

  test("never makes the publisher wait for the reactions to start", async () => {
    const { bus, sent } = eventBus();
    bus.publish(new Rang(1), { correlationId: "c1" });
    await Promise.resolve();
    expect(sent).toEqual([]);
    await bus.settled();
    expect(sent).toHaveLength(2);
  });

  test("an event the map says nothing about goes nowhere", async () => {
    const { bus, sent } = eventBus();
    bus.publish(new Fell(), { correlationId: "c1" });
    await bus.settled();
    expect(sent).toEqual([]);
  });

  test("reports every failure, and still sends the other inputs", async () => {
    const { bus, reported, sent } = eventBus(async input => { if (input instanceof Listen) throw new Error("listener down"); return "written"; });
    bus.publish(new Rang(1), { correlationId: "c1" });
    await bus.settled();
    expect(sent).toHaveLength(2);
    expect(reported).toEqual([new Error("listener down")]);
  });

  test("a map that fails is reported too", async () => {
    const { bus, reported, sent } = eventBus();
    bus.publish(new Explode(), { correlationId: "c1" });
    await bus.settled();
    expect(reported).toEqual([new Error("map down")]);
    expect(sent).toEqual([]);
  });

  test("delivers an event again in the envelope it was first published in", async () => {
    const { bus, sent } = eventBus();
    bus.redeliver(new Rang(1), { eventId: "first", correlationId: "c0" });
    await bus.settled();
    expect(sent.map(([, envelope]) => envelope)).toEqual([{ eventId: "first", correlationId: "c0" }, { eventId: "first", correlationId: "c0" }]);
  });

  test("lets anyone watch what is published, until they stop", () => {
    const { bus } = eventBus();
    const seen: unknown[] = [];
    const stop = bus.subscribe(published => seen.push(published));
    bus.publish(new Fell(), { correlationId: "c1" });
    stop();
    bus.publish(new Fell(), { correlationId: "c2" });
    expect(seen).toEqual([{ event: new Fell(), envelope: { eventId: "e1", correlationId: "c1" } }]);
  });

  test("is settled once the events, and the events their reactions published, are all carried", async () => {
    const steps: string[] = [];
    const { bus } = eventBus(async input => {
      if (input instanceof Listen && input.times > 0) bus.publish(new Rang(input.times - 1), { correlationId: "c1" });
      steps.push(JSON.stringify(input));
    });
    bus.publish(new Rang(2), { correlationId: "c1" });
    await bus.settled();
    expect(steps.filter(step => step.startsWith('{"times"'))).toEqual(['{"times":2}', '{"times":1}', '{"times":0}']);
  });
});
