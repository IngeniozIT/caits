import { describe, expect, test } from "vitest";
import { EventBus } from "../messaging/EventBus.js";
import { createStore } from "./createStore.js";
import { request } from "./request.js";

type Event = { type: "asked" } | { type: "answered"; answer: string };
type State = { answer: string | undefined };

const setup = () => {
  const events = new EventBus<Event>();
  const store = createStore<State, Event>({
    initialState: { answer: "old" },
    reduce: (_state, event) => ({ answer: event.type === "answered" ? event.answer : undefined }),
    send: () => undefined
  }, { events, bus: { execute: () => Promise.resolve() } });
  return { events, store, frontend: { events, store } };
};

describe("request", () => {
  test("publishes the event, then gives the first answer that a later state holds", async () => {
    const { events, frontend } = setup();
    const published: Event[] = [];
    events.subscribe(event => published.push(event));

    const answer = request(frontend, { type: "asked" }, state => state.answer);
    expect(published).toEqual([{ type: "asked" }]);
    events.publish({ type: "answered", answer: "new" });

    expect(await answer).toBe("new");
  });

  test("stops listening to the store once it has the answer", async () => {
    const { events, store, frontend } = setup();
    const answer = request(frontend, { type: "asked" }, state => state.answer);
    expect(store.subscriberCount()).toBe(1);

    events.publish({ type: "answered", answer: "new" });

    await answer;
    expect(store.subscriberCount()).toBe(0);
  });
});
