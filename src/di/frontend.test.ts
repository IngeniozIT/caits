import { afterEach, describe, expect, test, vi } from "vitest";
import { GreetingsRequested } from "../../test/project/frontend/greetings/application/event/GreetingsRequested.js";
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
