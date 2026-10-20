import { afterEach, describe, expect, test, vi } from "vitest";
import { FrontendEventBus } from "../messaging/FrontendEventBus.js";
import { FakeMessageBus } from "../testing/shared/FakeMessageBus.js";
import { createStore, type StoreDefinition } from "./createStore.js";

afterEach(() => { vi.restoreAllMocks(); });

class SaveTotal {
  constructor(readonly total: number) {}
}
type Event = { type: "add"; amount: number } | { type: "save" };

const total: StoreDefinition<number, Event> = {
  initialState: 0,
  reduce: (state, event) => event.type === "add" ? state + event.amount : state,
  send: (state, event) => event.type === "save" ? new SaveTotal(state) : undefined
};

const setup = (reportError?: (error: unknown) => void) => {
  const events = new FrontendEventBus<Event>();
  const bus = new FakeMessageBus();
  const store = createStore(total, { events, bus, ...(reportError ? { reportError } : {}) });
  return { events, bus, store };
};

describe("a store", () => {
  test("starts from the initial state", () => {
    expect(setup().store.getState()).toBe(0);
  });

  test("follows the events of the event bus and tells its subscribers, until they unsubscribe", () => {
    const { events, store } = setup();
    const seen: number[] = [];
    const stop = store.subscribe(state => seen.push(state));
    expect(store.subscriberCount()).toBe(1);

    events.publish({ type: "add", amount: 2 });
    events.publish({ type: "add", amount: 3 });
    stop();
    events.publish({ type: "add", amount: 4 });

    expect(seen).toEqual([2, 5]);
    expect(store.getState()).toBe(9);
    expect(store.subscriberCount()).toBe(0);
  });

  test("a subscriber that unsubscribes while being told does not change who is told of this state", () => {
    const { events, store } = setup();
    const seen: number[] = [];
    const stop = store.subscribe(() => { stop(); });
    store.subscribe(state => seen.push(state));

    events.publish({ type: "add", amount: 1 });

    expect(seen).toEqual([1]);
  });

  test("sends to the message bus the input DTO that an event asks for, and nothing for the other events", () => {
    const { events, bus } = setup();
    bus.expect(new SaveTotal(5));
    bus.replyToTheLast(undefined);

    events.publish({ type: "add", amount: 5 });
    events.publish({ type: "save" });

    bus.verify();
  });

  test("reads the state before the event to decide what to send, and tells its subscribers before it sends", () => {
    const sent: unknown[] = [];
    const events = new FrontendEventBus<Event>();
    const store = createStore({ ...total, reduce: () => 100 }, { events, bus: { send: async input => { sent.push([input, store.getState()]); return undefined; } } });

    events.publish({ type: "save" });

    expect(sent).toEqual([[new SaveTotal(0), 100]]);
  });

  test("reports a DTO that the message bus could not handle", async () => {
    const reported: unknown[] = [];
    const { events } = setup(error => reported.push(error));

    events.publish({ type: "save" });
    await Promise.resolve();

    expect(reported).toEqual([expect.objectContaining({ message: expect.stringContaining("SaveTotal") as string })]);
  });

  test("reports to the console when nobody said where to report", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { events } = setup();

    events.publish({ type: "save" });
    await Promise.resolve();

    expect(logged).toHaveBeenCalledOnce();
  });
});
