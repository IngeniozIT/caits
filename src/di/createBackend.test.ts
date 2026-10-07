import { afterEach, describe, expect, test, vi } from "vitest";
import { DomainEvent } from "../DomainEvent.js";
import { Controller, Dispatcher } from "../messaging/Controller.js";
import type { EventPublisher } from "../messaging/EventPublisher.js";
import { when } from "../messaging/ContextMap.js";
import { Input } from "../messaging/Input.js";
import { Token } from "../Token.js";
import { bind } from "./Container.js";
import { createBackend } from "./createBackend.js";
import type { BackendModules } from "./discover.js";
import type { RequestContext } from "./RequestContext.js";

class Greeted extends DomainEvent { constructor(readonly name: string) { super(); } }
class Greet extends Input<string> { constructor(readonly name: string) { super(); } }
class Remember extends Input<string> { constructor(readonly name: string) { super(); } }
class Unknown extends Input<void> {}
type Memory = string[];
const Memory = new Token<Memory>();
type Greeting = string;
const Greeting = new Token<Greeting>();
type Box = object;
const Box = new Token<Box>();

class GreetHandler {
  constructor(private greeting: Greeting, private events: EventPublisher<Greeted>) {}
  execute(input: Greet): string {
    this.events.publish(new Greeted(input.name));
    return `${this.greeting} ${input.name}`;
  }
}
class RememberHandler {
  constructor(private memory: Memory, private requestContext: RequestContext) {}
  execute(input: Remember): string {
    this.memory.push(`${input.name}@${this.requestContext.correlationId}`);
    return `remembered ${input.name}`;
  }
}
class GreetController extends Controller<Greet, string> {
  protected toDto(request: Request): Greet { return new Greet(new URL(request.url).searchParams.get("name") ?? ""); }
  protected toResponse(output: string): Response { return new Response(output); }
}
/** A memory that publishes: built once for its context, it cannot use the publisher of a request. */
class NoisyMemory extends Array<string> {
  constructor(readonly events: EventPublisher<Greeted>) { super(); }
}

const modules = (): BackendModules => ({
  shared: [bind(Greeting).toValue("Hello")],
  contexts: {
    greeter: { bindings: [], useCases: [{ input: Greet, handler: GreetHandler }], controllers: [GreetController] },
    memory: { bindings: [bind(Memory).toFactory(() => [])], useCases: [{ input: Remember, handler: RememberHandler }], controllers: [] }
  },
  map: [when(Greeted, event => [new Remember(event.name)])]
});

afterEach(() => { vi.restoreAllMocks(); });

describe("a backend built from the bindings of its contexts", () => {
  test("sends an input to the context that handles it, whose events reach the other contexts without making it wait", async () => {
    const backend = createBackend(modules(), { nextEventId: () => "e1" });
    expect(await backend.execute(new Greet("Ada"))).toBe("Hello Ada");
    expect(backend.get(Memory)).toEqual([]);
    await backend.settled();
    expect(backend.get(Memory)).toEqual(["Ada@system"]);
  });

  test("each request carries its correlation id to the reactions of the other contexts", async () => {
    const backend = createBackend(modules());
    await backend.execute(new Greet("Ada"), { correlationId: "req-1" });
    await backend.settled();
    expect(backend.get(Memory)).toEqual(["Ada@req-1"]);
  });

  test("builds a controller for a request", async () => {
    const backend = createBackend(modules());
    const response = await backend.controller(GreetController, { correlationId: "req-2" }).handle(new Request("http://localhost/?name=Bob"));
    expect(await response.text()).toBe("Hello Bob");
    expect(backend.controller(GreetController)).not.toBe(backend.controller(GreetController));
  });

  test("a Dispatcher bound in shared takes the place of the message bus of the requests: a test reads the DTOs that the controllers send", async () => {
    const sent: unknown[] = [];
    const dispatcher: Dispatcher<unknown, unknown> = { execute: dto => { sent.push(dto); return Promise.resolve("recorded"); } };
    const backend = createBackend(modules(), { replace: { shared: [bind(Dispatcher).toValue(dispatcher)] } });
    const response = await backend.controller(GreetController).handle(new Request("http://localhost/?name=Bob"));
    expect(await response.text()).toBe("recorded");
    expect(sent).toEqual([new Greet("Bob")]);
  });

  test("refuses an input or a controller no context owns", async () => {
    const backend = createBackend(modules());
    await expect(backend.execute(new Unknown())).rejects.toThrow("No context owns Unknown");
    expect(() => backend.controller(class Stray {})).toThrow("No context owns Stray");
  });

  test("a dependency is built only when something needs it, and once", async () => {
    const memory = vi.fn(() => []);
    const backend = createBackend({ ...modules(), contexts: { ...modules().contexts, memory: { ...modules().contexts.memory, bindings: [bind(Memory).toFactory(memory)] } } });
    expect(memory).not.toHaveBeenCalled();
    await backend.execute(new Remember("a"));
    await backend.execute(new Remember("b"));
    expect(memory).toHaveBeenCalledTimes(1);
  });

  test("a dependency built once for its context cannot use what only a request gives: the backend refuses it when it starts", () => {
    expect(() => createBackend(modules(), { replace: { memory: [bind(Memory).to(NoisyMemory)] } })).toThrow("Nothing is bound to RememberHandler → Memory → EventPublisher");
  });

  test("the bindings given replace those of a context, or those of shared for every context", async () => {
    const backend = createBackend(modules(), { replace: { shared: [bind(Greeting).toValue("Hi")], memory: [bind(Memory).toFactory(() => ["kept"])] } });
    expect(await backend.execute(new Greet("Ada"))).toBe("Hi Ada");
    await backend.settled();
    expect(backend.get(Memory)).toEqual(["kept", "Ada@system"]);
    expect(backend.get(Greeting)).toBe("Hi");
    const greeter = createBackend(modules(), { replace: { shared: [bind(Greeting).toValue("Hi")], greeter: [bind(Greeting).toValue("Hey")] } });
    expect(await greeter.execute(new Greet("Ada"))).toBe("Hey Ada");
  });

  test("a shared dependency is built once, for every context", async () => {
    const box = vi.fn(() => ({}));
    const backend = createBackend({ ...modules(), shared: [...modules().shared, bind(Box).toFactory(box)] }, { replace: { greeter: [bind(Greeting).toValue("Hi")] } });
    expect(backend.get(Box)).toBe(backend.get(Box));
    expect(box).toHaveBeenCalledTimes(1);
    expect(await backend.execute(new Greet("Ada"))).toBe("Hi Ada");
  });

  test("a test reads a dependency by its token, but not one that nothing binds, or that two contexts each bind", () => {
    const backend = createBackend(modules(), { replace: { greeter: [bind(Box).toValue({})], memory: [bind(Box).toValue({})] } });
    expect(backend.get(Memory)).toEqual([]);
    expect(backend.get(Greeting)).toBe("Hello");
    expect(() => backend.get(new Token("nothing"))).toThrow("No context binds nothing");
    expect(() => backend.get(Box)).toThrow("The contexts greeter, memory each bind Box");
  });

  test("a test gives the dependency that the contexts use from now on, even after they built their own", async () => {
    const backend = createBackend(modules());
    await backend.execute(new Remember("Ada"));
    const kept: string[] = [];
    expect(backend.use(Memory, kept)).toBe(kept);
    backend.use(Greeting, "Hi");
    expect(await backend.execute(new Greet("Bob"))).toBe("Hi Bob");
    await backend.settled();
    expect(kept).toEqual(["Bob@system"]);
    expect(() => backend.use(new Token("nothing"), 1)).toThrow("No context binds nothing");
  });

  test("publishes, delivers again, lets anyone watch, and settles", async () => {
    const backend = createBackend(modules(), { nextEventId: () => "e1" });
    const seen: unknown[] = [];
    backend.subscribe(published => seen.push(published));
    backend.publish(new Greeted("Ada"));
    backend.redeliver({ event: new Greeted("Ada"), envelope: { eventId: "e1", correlationId: "req-3" } });
    await backend.settled();
    expect(seen).toEqual([
      { event: new Greeted("Ada"), envelope: { eventId: "e1", correlationId: "system" } },
      { event: new Greeted("Ada"), envelope: { eventId: "e1", correlationId: "req-3" } }
    ]);
    expect(backend.get(Memory)).toEqual(["Ada@system", "Ada@req-3"]);
  });

  test("by default, gives each event a random id and writes the failures to the console", async () => {
    const console = vi.spyOn(globalThis.console, "error").mockImplementation(() => undefined);
    const backend = createBackend(modules(), { replace: { memory: [bind(Memory).toFactory(() => { throw new Error("memory lost"); })] } });
    const seen: string[] = [];
    backend.subscribe(({ envelope }) => seen.push(envelope.eventId));
    expect(await backend.execute(new Greet("Ada"))).toBe("Hello Ada");
    await backend.settled();
    expect(seen).toEqual([expect.stringMatching(/^[0-9a-f-]{36}$/)]);
    expect(console).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("memory lost") as string }));
  });
});
