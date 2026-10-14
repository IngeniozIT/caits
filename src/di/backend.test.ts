import { describe, expect, test, vi } from "vitest";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** A fresh backend module, with the controller class of the same fresh modules. */
const fresh = async () => {
  vi.resetModules();
  const { GreetHttpController } = await import("../../test/project/backend/greetings/command/greet/greet.http.controller.js");
  return { ...await import("./backend.js"), GreetHttpController };
};
const greet = (name: string) => new Request(`http://localhost/api/greet?name=${name}`, { method: "POST" });

describe("the backend that serves the routes", () => {
  test("starts on the first request, with the bindings of the di.ts of the contexts", async () => {
    const { controller, GreetHttpController } = await fresh();

    expect(await (await controller(GreetHttpController).handle(greet("Ada"))).json()).toEqual({ greeting: "Hello, Ada" });
  });

  test("serves each request with a controller of its own, and a fresh correlation id", async () => {
    const { controller, startBackend, GreetHttpController } = await fresh();
    const backend = startBackend();
    const correlations: string[] = [];
    backend.subscribe(({ envelope }) => correlations.push(envelope.correlationId));

    expect(controller(GreetHttpController)).not.toBe(controller(GreetHttpController));
    await controller(GreetHttpController).handle(greet("Ada"));
    await controller(GreetHttpController).handle(greet("Grace"));
    await backend.settled();

    expect(correlations).toEqual([expect.stringMatching(uuid), expect.stringMatching(uuid)]);
    expect(new Set(correlations).size).toBe(2);
  });
});
