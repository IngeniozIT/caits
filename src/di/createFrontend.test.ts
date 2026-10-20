import { describe, expect, test, vi } from "vitest";
import type { EventPublisher } from "../messaging/EventPublisher.js";
import type { StoreDefinition } from "../state/createStore.js";
import { Token } from "../Token.js";
import { bind } from "./Container.js";
import { createFrontend, createFrontendWithBus } from "./createFrontend.js";
import type { FrontendModules } from "./discoverFrontends.js";
import type { Fetcher } from "./Fetcher.js";

class Ping {
  constructor(readonly text: string) {}
}
type Event = { type: "asked"; text: string } | { type: "answered"; text: string };
interface Echo { say(text: string): string }
const Echo = new Token<Echo>();

class LoudEcho implements Echo {
  constructor(private readonly fetcher: Fetcher) {}
  say(text: string): string { void this.fetcher(`/echo/${text}`); return text.toUpperCase(); }
}

class PingHandler {
  constructor(private readonly echo: Echo, private readonly events: EventPublisher<Event>) {}
  execute(ping: Ping): void { this.events.publish({ type: "answered", text: this.echo.say(ping.text) }); }
}

const store: StoreDefinition<string[], Event> = {
  initialState: [],
  reduce: (state, event) => event.type === "answered" ? [...state, event.text] : state,
  send: (_state, event) => event.type === "asked" ? new Ping(event.text) : undefined
};
const context: FrontendModules = {
  bindings: [bind(Echo).to(LoudEcho)],
  useCases: [{ input: Ping, handler: PingHandler }],
  store,
  map: []
};
const quiet: Fetcher = () => Promise.resolve(new Response());

/** The store of a frontend whose context has one. */
function storeOf<S>(frontend: { store: S | undefined }): S {
  if (!frontend.store) throw new Error("the context has a store");
  return frontend.store;
}

describe("a frontend built by the kernel", () => {
  test("a context without a store gives its views its EventPublisher only", () => {
    const frontend = createFrontend({ bindings: [], useCases: [], map: [] }, quiet);

    expect(frontend.store).toBeUndefined();
    expect(() => frontend.events.publish({ type: "asked", text: "a" })).not.toThrow();
  });

  test("gives the views its EventPublisher and its store, nothing else", () => {
    expect(Object.keys(createFrontend(context, quiet))).toEqual(["events", "store"]);
  });

  test("an event of a view goes through the store, the message bus and the handler, and the answer comes back to the store", () => {
    const frontend = createFrontend(context, quiet);
    const { events } = frontend;
    const built = storeOf(frontend);

    events.publish({ type: "asked", text: "hi" });

    expect(built.getState()).toEqual(["HI"]);
  });

  test("the dependencies of its di.ts reach the API with the fetch it is given", () => {
    const fetch = vi.fn(quiet);
    createFrontend(context, fetch).events.publish({ type: "asked", text: "hi" });
    expect(fetch).toHaveBeenCalledWith("/echo/hi");
  });

  test("the bindings it is given replace those of its di.ts", () => {
    const frontend = createFrontend(context, quiet, [bind(Echo).toValue({ say: () => "replaced" })]);
    const { events } = frontend;
    const built = storeOf(frontend);

    events.publish({ type: "asked", text: "hi" });

    expect(built.getState()).toEqual(["replaced"]);
  });

  test("refuses at once a handler that needs a dependency that nothing gives", () => {
    expect(() => createFrontend({ ...context, bindings: [] }, quiet)).toThrow("Nothing is bound to PingHandler → Echo");
  });

  test("each frontend has dependencies of its own", () => {
    const first = createFrontend(context, quiet);
    const second = createFrontend(context, quiet);

    first.events.publish({ type: "asked", text: "hi" });

    expect(storeOf(second).getState()).toEqual([]);
  });

  test("with its message bus, for the tests of the application: a DTO goes to the handler, and its events reach the store", async () => {
    const frontend = createFrontendWithBus(context, quiet);
    const { bus } = frontend;
    const built = storeOf(frontend);

    await bus.send(new Ping("hi"));

    expect(built.getState()).toEqual(["HI"]);
  });

  test("a test reads a dependency by its token, and gives the one that the handlers use from now on, even after they used their own", async () => {
    const frontend = createFrontendWithBus(context, quiet);
    const { bus, get, use } = frontend;
    const built = storeOf(frontend);
    await bus.send(new Ping("hi"));
    expect(get(Echo).say("ho")).toBe("HO");

    const replaced: Echo = { say: () => "replaced" };
    expect(use(Echo, replaced)).toBe(replaced);
    await bus.send(new Ping("hi"));

    expect(built.getState()).toEqual(["HI", "replaced"]);
  });
});
