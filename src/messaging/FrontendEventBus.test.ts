import { afterEach, describe, expect, test, vi } from "vitest";
import { FrontendEventBus } from "./FrontendEventBus.js";

afterEach(() => { vi.restoreAllMocks(); });

describe("an event bus", () => {
  test("delivers an event to every subscriber, until they unsubscribe", () => {
    const bus = new FrontendEventBus<string>();
    const first: string[] = [];
    const second: string[] = [];
    const stopFirst = bus.subscribe(event => first.push(event));
    bus.subscribe(event => second.push(event));

    bus.publish("a");
    stopFirst();
    bus.publish("b");

    expect([first, second]).toEqual([["a"], ["a", "b"]]);
  });

  test("reports a failing subscriber without keeping the others from the event", () => {
    const reported: unknown[] = [];
    const received: string[] = [];
    const bus = new FrontendEventBus<string>(error => reported.push(error));
    bus.subscribe(() => { throw new Error("subscriber down"); });
    bus.subscribe(event => received.push(event));

    expect(() => { bus.publish("a"); }).not.toThrow();

    expect(reported).toEqual([new Error("subscriber down")]);
    expect(received).toEqual(["a"]);
  });

  test("a subscriber that unsubscribes while being notified does not change who is notified of this event", () => {
    const bus = new FrontendEventBus<string>();
    const first: string[] = [];
    const received: string[] = [];
    const stop = bus.subscribe(event => { first.push(event); stop(); });
    bus.subscribe(event => received.push(event));

    bus.publish("a");
    bus.publish("b");

    expect([first, received]).toEqual([["a"], ["a", "b"]]);
  });

  test("an event published during a delivery waits until every subscriber has received the current one", () => {
    const bus = new FrontendEventBus<string>();
    const received: string[] = [];
    bus.subscribe(event => { if (event === "request") bus.publish("answer"); });
    bus.subscribe(event => received.push(event));

    bus.publish("request");

    expect(received).toEqual(["request", "answer"]);
  });

  test("a reporter that fails does not block the bus", () => {
    const bus = new FrontendEventBus<string>(() => { throw new Error("reporter down"); });
    const received: string[] = [];
    const stop = bus.subscribe(() => { throw new Error("subscriber down"); });

    expect(() => { bus.publish("a"); }).toThrow("reporter down");
    stop();
    bus.subscribe(event => received.push(event));
    bus.publish("b");

    expect(received).toEqual(["b"]);
  });

  test("reports to the console when nobody said where to report", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const bus = new FrontendEventBus<string>();
    bus.subscribe(() => { throw new Error("subscriber down"); });

    bus.publish("a");

    expect(logged).toHaveBeenCalledExactlyOnceWith(new Error("subscriber down"));
  });
});
