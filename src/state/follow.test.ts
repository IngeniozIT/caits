import { describe, expect, test } from "vitest";
import { EventBus } from "../messaging/EventBus.js";
import { createStore } from "./createStore.js";
import { follow } from "./follow.js";

type Event = { type: "set"; value: number };

const setup = () => {
  const events = new EventBus<Event>();
  const store = createStore<number, Event>({
    initialState: 1,
    reduce: (_state, event) => event.value,
    send: () => undefined
  }, { events, bus: { execute: () => Promise.resolve() } });
  const shown: string[] = [];
  return { events, store, shown, show: (view: string) => { shown.push(view); } };
};
const present = (state: number) => `value ${state}`;

describe("follow", () => {
  test("shows what the current state presents at once", () => {
    const { events, store, shown, show } = setup();
    events.publish({ type: "set", value: 4 });

    follow(store, present, show);

    expect(shown).toEqual(["value 4"]);
  });

  test("shows what each new state presents", () => {
    const { events, store, shown, show } = setup();
    follow(store, present, show);

    events.publish({ type: "set", value: 2 });
    events.publish({ type: "set", value: 3 });

    expect(shown).toEqual(["value 1", "value 2", "value 3"]);
  });

  test("shows nothing more once stopped, and no longer listens to the store", () => {
    const { events, store, shown, show } = setup();
    const baseline = store.subscriberCount();
    const stop = follow(store, present, show);
    expect(store.subscriberCount()).toBe(baseline + 1);

    stop();
    events.publish({ type: "set", value: 2 });

    expect(shown).toEqual(["value 1"]);
    expect(store.subscriberCount()).toBe(baseline);
  });
});
