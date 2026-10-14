import { afterEach, describe, expect, test, vi } from "vitest";
import { GreetingsRequested } from "../../test/project/frontend/greetings/event/GreetingsRequested.js";
import { GreetingsAsked } from "../../test/project/frontend/shared/event/GreetingsAsked.js";
import { ThemeChosen } from "../../test/project/frontend/shared/event/ThemeChosen.js";
import { WelcomeShown } from "../../test/project/frontend/welcome/event/WelcomeShown.js";
import { settled } from "../state/Loadable.js";
import { request } from "../state/request.js";
import { discoveredFrontends } from "./discoveredFrontends.js";
import { frontendOf, frontendsOn, type Frontends } from "./frontend.js";

afterEach(() => { vi.unstubAllGlobals(); });

const greetings = ["Hello, Ada"];
const api = () => vi.fn(async (_input: string) => Response.json({ greetings }));
const listed = ($global: object) => request(frontendOf($global, "greetings"), new GreetingsRequested(), state => settled(state.greetings));

describe("the frontend of a context, for the views of one $global", () => {
  test("is built the first time a view asks, then kept on that $global: one per request on the server, one per page in the browser", () => {
    const $global = {};
    const other = {};
    expect(frontendOf($global, "greetings")).toBe(frontendOf($global, "greetings"));
    expect(frontendOf(other, "greetings")).not.toBe(frontendOf($global, "greetings"));
  });

  test("on the server, reaches the API with the fetch of the request", async () => {
    const fetch = api();

    expect(await listed({ fetch })).toEqual({ status: "loaded", data: greetings });
    expect(fetch).toHaveBeenCalledWith("/api/greetings");
  });

  test("in the browser, where $global has no fetch, reaches the API with the fetch of the browser", async () => {
    const fetch = api();
    vi.stubGlobal("fetch", fetch);

    expect(await listed({})).toEqual({ status: "loaded", data: greetings });
    expect(fetch).toHaveBeenCalledWith("/api/greetings", undefined);
  });

  test("a frontend already on $global is the one the views get", () => {
    const $global = {};
    const prepared = { events: { publish: () => undefined }, store: { getState: () => ({ greetings: { status: "idle" } }), subscribe: () => () => undefined, subscriberCount: () => 0 } } as const;
    frontendsOn($global).set("greetings", prepared);
    expect(frontendOf($global, "greetings")).toBe(prepared);
  });

  test("every frontend context can build the handlers of its use cases with the bindings of its di.ts", () => {
    for (const name of Object.keys(discoveredFrontends)) expect(() => frontendOf({}, name as keyof Frontends)).not.toThrow();
  });

  test("an unknown context is refused", () => {
    expect(() => frontendOf({}, "nowhere" as "greetings")).toThrow("No frontend context is named nowhere");
  });
});

describe("the shared bus: the frontend of the context shared, for the frontends of one $global", () => {
  /** The next turn of the event loop: the handlers answer, and the store reads their events. */
  const settle = () => new Promise(resolve => { setTimeout(resolve, 0); });

  test("an event of shared reaches each context whose context map hears it, as an event of that context: its store reads it", async () => {
    const fetch = api();
    const $global = { fetch };

    frontendOf($global, "shared").events.publish(new GreetingsAsked());
    await settle();

    expect(fetch).toHaveBeenCalledWith("/api/greetings");
    expect(frontendOf($global, "greetings").store.getState()).toEqual({ greetings: { status: "loaded", data: greetings } });
  });

  test("a context map shares an event of its context on the shared bus of its $global: the contexts whose context map hears it read it", async () => {
    const fetch = api();
    const $global = { fetch };

    frontendOf($global, "welcome").events.publish(new WelcomeShown());
    await settle();

    expect(fetch).toHaveBeenCalledWith("/api/greetings");
    expect(frontendOf($global, "greetings").store.getState()).toEqual({ greetings: { status: "loaded", data: greetings } });
  });

  test("the frontend of shared is built when a context first shares an event, on the $global of that context", () => {
    const $global = { fetch: api() };
    const other = { fetch: api() };
    frontendOf(other, "welcome");

    frontendOf($global, "greetings").events.publish(new GreetingsRequested());
    expect(frontendsOn($global).has("shared")).toBe(false);
    frontendOf($global, "welcome").events.publish(new WelcomeShown());

    expect([...frontendsOn($global).keys()]).toEqual(["greetings", "welcome", "shared"]);
    expect([...frontendsOn(other).keys()]).toEqual(["welcome"]);
  });

  test("a line that shares hears nothing on the shared bus: an event of a context there reaches no context", () => {
    const $global = { fetch: api() };

    // The types refuse it already: the shared bus takes the events of shared.
    frontendOf($global, "shared").events.publish(new WelcomeShown() as never);

    expect([...frontendsOn($global).keys()]).toEqual(["shared"]);
  });

  test("a context that a view already asked for hears it too, on the same frontend", async () => {
    const $global = { fetch: api() };
    const frontend = frontendOf($global, "greetings");

    frontendOf($global, "shared").events.publish(new GreetingsAsked());
    await settle();

    expect(frontendOf($global, "greetings")).toBe(frontend);
    expect(frontend.store.getState()).toEqual({ greetings: { status: "loaded", data: greetings } });
  });

  test("an event of shared that no context hears builds no frontend, and the other $global hears nothing", () => {
    const $global = { fetch: api() };
    const other = { fetch: api() };
    frontendOf(other, "greetings");

    frontendOf($global, "shared").events.publish(new ThemeChosen());
    expect(frontendsOn($global).has("greetings")).toBe(false);
    frontendOf($global, "shared").events.publish(new GreetingsAsked());

    expect(frontendsOn($global).has("greetings")).toBe(true);
    expect(frontendOf(other, "greetings").store.getState()).toEqual({ greetings: { status: "idle" } });
  });

  test("an event of a context stays in it: the context shared hears no other context", () => {
    const $global = { fetch: api() };
    frontendOf($global, "shared");

    frontendOf($global, "greetings").events.publish(new GreetingsRequested());

    expect([...frontendsOn($global).keys()]).toEqual(["shared", "greetings"]);
  });

  test("only the shared bus carries the events to the context maps: an event of shared on the bus of a context stays there", async () => {
    const fetch = api();
    const $global = { fetch };

    // The types refuse it already: the bus of a context takes its own events.
    frontendOf($global, "greetings").events.publish(new GreetingsAsked() as never);
    await settle();

    expect(fetch).not.toHaveBeenCalled();
  });

  test("the context shared has no store: its frontend is its bus", () => {
    expect(frontendOf({}, "shared")).toEqual({ events: expect.anything(), store: undefined });
  });
});
