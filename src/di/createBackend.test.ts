import { afterEach, describe, expect, test, vi } from "vitest";
import { DomainEvent } from "../DomainEvent.js";
import { Controller } from "../messaging/Controller.js";
import type { EventPublisher } from "../messaging/EventPublisher.js";
import { share, when } from "../messaging/ContextMap.js";
import { MessageBus } from "../messaging/MessageBus.js";
import { ContextEvents } from "../messaging/ContextEvents.js";
import { RequestEvents } from "../messaging/RequestEvents.js";
import { TimerController } from "../messaging/TimerController.js";
import { Token } from "../Token.js";
import { bind } from "./Container.js";
import { createBackend, type Schedule } from "./createBackend.js";
import type { BackendModules } from "./discover.js";
import type { RequestContext } from "./RequestContext.js";
import type { Request } from "../messaging/Request.js";

class Greeted extends DomainEvent { constructor(readonly name: string) { super(); } }
class Arrived extends DomainEvent { constructor(readonly name: string) { super(); } }
class Greet { constructor(readonly name: string) {} }
class Remember { constructor(readonly name: string) {} }
class Announce { constructor(readonly name: string) {} }
class Unknown {}
type Memory = string[];
const Memory = new Token<Memory>();
type Greeting = string;
const Greeting = new Token<Greeting>();
type Box = object;
const Box = new Token<Box>();
type Lamp = object;
const Lamp = new Token<Lamp>();

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
class AnnounceHandler {
  constructor(private events: EventPublisher<Arrived>) {}
  execute(input: Announce): string {
    this.events.publish(new Arrived(input.name));
    return `announced ${input.name}`;
  }
}
/** A memory that publishes: built once for its context, it cannot use the publisher of a request. */
class NoisyMemory extends Array<string> {
  constructor(readonly events: EventPublisher<Greeted>) { super(); }
}

// Greeted is an event of the greeter, which its context map shares as Arrived, an event of the context shared, that the memory hears.
const modules = (): BackendModules => ({
  shared: [bind(Greeting).toValue("Hello")],
  contexts: {
    greeter: { bindings: [], useCases: [{ input: Greet, handler: GreetHandler }], controllers: [GreetController], map: [share(Greeted, event => [new Arrived(event.name)])] },
    memory: { bindings: [bind(Memory).toFactory(() => [])], useCases: [{ input: Remember, handler: RememberHandler }], controllers: [], map: [when(Arrived, event => [new Remember(event.name)])] }
  }
});
const withMaps = (maps: { greeter?: BackendModules["contexts"][string]["map"]; memory?: BackendModules["contexts"][string]["map"] }): BackendModules => {
  const { contexts, ...rest } = modules();
  return { ...rest, contexts: { greeter: { ...contexts.greeter, map: maps.greeter ?? contexts.greeter.map }, memory: { ...contexts.memory, map: maps.memory ?? contexts.memory.map } } };
};

// A context whose handler keeps the signal of each request that it serves.
class Probe {}
type Signals = AbortSignal[];
const Signals = new Token<Signals>();
class ProbeHandler {
  constructor(private signals: Signals, private requestContext: RequestContext) {}
  execute(_input: Probe): string {
    this.signals.push(this.requestContext.signal);
    return "probed";
  }
}
class ProbeController extends Controller<Probe, string> {
  protected toDto(): Probe { return new Probe(); }
  protected toResponse(output: string): Response { return new Response(output); }
}
const probing = (): BackendModules => ({
  shared: [],
  contexts: { probe: { bindings: [bind(Signals).toFactory(() => [])], useCases: [{ input: Probe, handler: ProbeHandler }], controllers: [ProbeController], map: [] } }
});

afterEach(() => { vi.restoreAllMocks(); });

/** A controller that listens: to the events of its request, and to those of its context. */
class ListeningController {
  constructor(readonly bus: MessageBus, readonly request: RequestEvents, readonly context: ContextEvents) {}
}
const withListener = (replace: Parameters<typeof createBackend>[1] = {}) => {
  const { contexts, ...rest } = modules();
  return createBackend({ ...rest, contexts: { ...contexts, greeter: { ...contexts.greeter, controllers: [GreetController, ListeningController] } } }, replace);
};

// A timer of the memory: at each turn, it remembers "tick", in a request of its own.
class RememberTickController extends TimerController<Remember> {
  readonly every: number = 1000;
  protected toDto(): Remember { return new Remember("tick"); }
}
class BrokenTimerController extends TimerController<Remember> {
  readonly every = Number.NaN;
  protected toDto(): Remember { return new Remember("never"); }
}
/** Built at each turn of its timer, in the request of the turn: it fails from its second build on. */
class Flaky {
  static builds = 0;
  constructor() {
    Flaky.builds++;
    if (Flaky.builds > 1) throw new Error("flaky");
  }
}
class FlakyTimerController extends TimerController<Remember> {
  readonly every: number = 1000;
  constructor(bus: MessageBus, readonly flaky: Flaky) { super(bus); }
  protected toDto(): Remember { return new Remember("flaky"); }
}
/** A handler that the test lets finish: its turn runs until then. */
let finishTurn: () => void = () => {};
class SlowRememberHandler {
  constructor(private memory: Memory) {}
  async execute(input: Remember): Promise<string> {
    this.memory.push(`${input.name} started`);
    await new Promise<void>(resolve => { finishTurn = resolve; });
    this.memory.push(`${input.name} done`);
    return "remembered";
  }
}
/** A handler that runs until the signal of its request aborts, then remembers it: one whose name starts with "deaf" never hears it. */
class WatchfulRememberHandler {
  constructor(private memory: Memory, private requestContext: RequestContext) {}
  async execute(input: Remember): Promise<string> {
    this.memory.push(`${input.name} started`);
    if (input.name.startsWith("deaf")) await new Promise(() => {});
    await new Promise(resolve => { this.requestContext.signal.addEventListener("abort", resolve); });
    this.memory.push(`${input.name} stopped`);
    return "remembered";
  }
}
class DeafTickController extends TimerController<Remember> {
  readonly every: number = 1000;
  protected toDto(): Remember { return new Remember("deaf tick"); }
}
const withTimers = (controllers: BackendModules["contexts"][string]["controllers"], handler: BackendModules["contexts"][string]["useCases"][number]["handler"] = RememberHandler): BackendModules => {
  const { contexts, ...rest } = modules();
  return { ...rest, contexts: { ...contexts, memory: { ...contexts.memory, useCases: [{ input: Remember, handler }], controllers } } };
};
/** A clock that the test turns: each timer, with its rhythm, and whether it was cancelled. */
function testClock() {
  const timers: { every: number; turn: () => void; cancelled: boolean }[] = [];
  const schedule: Schedule = (every, turn) => {
    const timer = { every, turn, cancelled: false };
    timers.push(timer);
    return () => { timer.cancelled = true; };
  };
  return { timers, schedule };
}
const released: string[] = [];
const resource = (name: string) => ({ [Symbol.asyncDispose]: async () => { released.push(name); } });

describe("a backend built from the bindings of its contexts", () => {
  test("sends an input to the context that handles it, whose events reach the other contexts without making it wait", async () => {
    const backend = createBackend(modules(), { nextEventId: () => "e1" });
    expect(await backend.send(new Greet("Ada"))).toBe("Hello Ada");
    expect(backend.get(Memory)).toEqual([]);
    await backend.settled();
    expect(backend.get(Memory)).toEqual(["Ada@system"]);
  });

  test("each request carries its correlation id to the reactions of the other contexts", async () => {
    const backend = createBackend(modules());
    await backend.send(new Greet("Ada"), { correlationId: "req-1" });
    await backend.settled();
    expect(backend.get(Memory)).toEqual(["Ada@req-1"]);
  });

  test("a handler reads in its RequestContext the signal that went with its DTO: it aborts when the client leaves, or came aborted", async () => {
    const backend = createBackend(probing());
    const client = new AbortController();
    const gone = new AbortController();
    gone.abort();
    await backend.send(new Probe(), { signal: client.signal });
    await backend.send(new Probe(), { correlationId: "req-1", signal: gone.signal });
    const [staying, left] = backend.get(Signals);
    expect([staying.aborted, left.aborted]).toEqual([false, true]);
    client.abort();
    expect(staying.aborted).toBe(true);
  });

  test("a controller gives its handler the signal of its request: the handler sees its client leave", async () => {
    const backend = createBackend(probing());
    const client = new AbortController();
    const response = await backend.controller(ProbeController, { correlationId: "req-2" }).handle(new globalThis.Request("http://localhost/", { signal: client.signal }));
    expect(await response.text()).toBe("probed");
    const [signal] = backend.get(Signals);
    expect(signal.aborted).toBe(false);
    client.abort();
    expect(signal.aborted).toBe(true);
  });

  test("a DTO that the backend sends without a signal, as a test does, gets a signal that does not abort", async () => {
    const backend = createBackend(probing());
    await backend.send(new Probe());
    const [signal] = backend.get(Signals);
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
  });

  test("builds a controller for a request", async () => {
    const backend = createBackend(modules());
    const response = await backend.controller(GreetController, { correlationId: "req-2" }).handle(new globalThis.Request("http://localhost/?name=Bob"));
    expect(await response.text()).toBe("Hello Bob");
    expect(backend.controller(GreetController)).not.toBe(backend.controller(GreetController));
  });

  test("a MessageBus bound in shared takes the place of the message bus of the requests: a test reads the DTOs that the controllers send", async () => {
    const sent: unknown[] = [];
    const bus: MessageBus = { send: dto => { sent.push(dto); return Promise.resolve("recorded" as never); } };
    const backend = createBackend(modules(), { replace: { shared: [bind(MessageBus).toValue(bus)] } });
    const response = await backend.controller(GreetController).handle(new globalThis.Request("http://localhost/?name=Bob"));
    expect(await response.text()).toBe("recorded");
    expect(sent).toEqual([new Greet("Bob")]);
  });

  test("refuses an input or a controller no context owns, and tells where to write it", async () => {
    const backend = createBackend(modules());
    await expect(backend.send(new Unknown())).rejects.toThrow(
      "No handler takes Unknown: write one next to its DTO, in <use-case>.handler.ts, with execute(input: Unknown)"
    );
    expect(() => backend.controller(class Stray {})).toThrow(
      "No context has the controller Stray: write it in the folder of its use case, as <use-case>.<name>.controller.ts"
    );
  });

  test("a dependency is built only when something needs it, and once", async () => {
    const memory = vi.fn(() => []);
    const backend = createBackend({ ...modules(), contexts: { ...modules().contexts, memory: { ...modules().contexts.memory, bindings: [bind(Memory).toFactory(memory)] } } });
    expect(memory).not.toHaveBeenCalled();
    await backend.send(new Remember("a"));
    await backend.send(new Remember("b"));
    expect(memory).toHaveBeenCalledTimes(1);
  });

  test("a dependency built once for its context cannot use what only a request gives: the backend refuses it when it starts", () => {
    expect(() => createBackend(modules(), { replace: { memory: [bind(Memory).to(NoisyMemory)] } })).toThrow("Nothing is bound to RememberHandler → Memory → EventPublisher");
  });

  test("the bindings given replace those of a context, or those of shared for every context", async () => {
    const backend = createBackend(modules(), { replace: { shared: [bind(Greeting).toValue("Hi")], memory: [bind(Memory).toFactory(() => ["kept"])] } });
    expect(await backend.send(new Greet("Ada"))).toBe("Hi Ada");
    await backend.settled();
    expect(backend.get(Memory)).toEqual(["kept", "Ada@system"]);
    expect(backend.get(Greeting)).toBe("Hi");
    const greeter = createBackend(modules(), { replace: { shared: [bind(Greeting).toValue("Hi")], greeter: [bind(Greeting).toValue("Hey")] } });
    expect(await greeter.send(new Greet("Ada"))).toBe("Hey Ada");
  });

  test("a shared dependency is built once, for every context", async () => {
    const box = vi.fn(() => ({}));
    const backend = createBackend({ ...modules(), shared: [...modules().shared, bind(Box).toFactory(box)] }, { replace: { greeter: [bind(Greeting).toValue("Hi")] } });
    expect(backend.get(Box)).toBe(backend.get(Box));
    expect(box).toHaveBeenCalledTimes(1);
    expect(await backend.send(new Greet("Ada"))).toBe("Hi Ada");
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
    await backend.send(new Remember("Ada"));
    const kept: string[] = [];
    expect(backend.use(Memory, kept)).toBe(kept);
    backend.use(Greeting, "Hi");
    expect(await backend.send(new Greet("Bob"))).toBe("Hi Bob");
    await backend.settled();
    expect(kept).toEqual(["Bob@system"]);
    expect(() => backend.use(new Token("nothing"), 1)).toThrow("No context binds nothing");
  });

  test("publishes, delivers again, lets anyone watch, and settles", async () => {
    const backend = createBackend(modules(), { nextEventId: () => "e1" });
    const seen: unknown[] = [];
    backend.subscribe(published => seen.push(published));
    backend.publish(new Arrived("Ada"));
    backend.redeliver({ event: new Arrived("Ada"), envelope: { eventId: "e1", correlationId: "req-3" } });
    await backend.settled();
    expect(seen).toEqual([
      { event: new Arrived("Ada"), envelope: { eventId: "e1", correlationId: "system" } },
      { event: new Arrived("Ada"), envelope: { eventId: "e1", correlationId: "req-3" } }
    ]);
    expect(backend.get(Memory)).toEqual(["Ada@system", "Ada@req-3"]);
  });

  test("by default, gives each event a random id and writes the failures to the console", async () => {
    const console = vi.spyOn(globalThis.console, "error").mockImplementation(() => undefined);
    const backend = createBackend(modules(), { replace: { memory: [bind(Memory).toFactory(() => { throw new Error("memory lost"); })] } });
    const seen: string[] = [];
    backend.subscribe(({ envelope }) => seen.push(envelope.eventId));
    expect(await backend.send(new Greet("Ada"))).toBe("Hello Ada");
    await backend.settled();
    expect(seen).toEqual([expect.stringMatching(/^[0-9a-f-]{36}$/)]);
    expect(console).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("memory lost") as string }));
  });

  test("a context map gives only the inputs of its own context: one that gives the input of another context is reported, and sends nothing", async () => {
    const reported: unknown[] = [];
    const backend = createBackend(withMaps({ memory: [when(Arrived, event => [new Greet(event.name)])] }), { reportError: error => { reported.push(error); } });
    const greeted: string[] = [];
    backend.subscribe(({ event }) => greeted.push((event as Arrived).name));

    await backend.send(new Greet("Ada"));
    await backend.settled();

    expect(greeted).toEqual(["Ada"]);
    expect(reported).toEqual([new Error("the context map of memory gives Greet, an input of another context: a context map gives the inputs of its own context")]);
  });
});

describe("the context maps of the backend", () => {
  test("a handler publishes an event of its context: its context map shares it on the shared bus, in the request of the handler", async () => {
    const backend = createBackend(modules(), { nextEventId: () => "e1" });
    const told: unknown[] = [];
    const seen: unknown[] = [];
    backend.subscribeToContexts(event => told.push(event));
    backend.subscribe(published => seen.push(published));

    await backend.send(new Greet("Ada"), { correlationId: "req-1" });

    expect(told).toEqual([new Greeted("Ada")]);
    expect(seen).toEqual([{ event: new Arrived("Ada"), envelope: { eventId: "e1", correlationId: "req-1" } }]);
  });

  test("an event that the map of its context does not share stays in its context: no other context hears it", async () => {
    const backend = createBackend(withMaps({ greeter: [], memory: [when(Greeted, event => [new Remember(event.name)])] }));
    const seen: unknown[] = [];
    backend.subscribe(published => seen.push(published));

    await backend.send(new Greet("Ada"));
    await backend.settled();

    expect(seen).toEqual([]);
    expect(backend.get(Memory)).toEqual([]);
  });

  test("a context map shares only the events of its own context", async () => {
    const backend = createBackend(withMaps({ memory: [when(Arrived, event => [new Remember(event.name)]), share(Greeted, event => [new Arrived(`${event.name} again`)])] }));

    await backend.send(new Greet("Ada"));
    await backend.settled();

    expect(backend.get(Memory)).toEqual(["Ada@system"]);
  });

  test("a line that shares hears nothing on the shared bus", async () => {
    const reported: unknown[] = [];
    const backend = createBackend(withMaps({ memory: [share(Arrived, () => [new Greeted("nobody")])] }), { reportError: error => { reported.push(error); } });

    backend.publish(new Arrived("Ada"));
    await backend.settled();

    expect(backend.get(Memory)).toEqual([]);
    expect(reported).toEqual([]);
  });

  test("a line that shares and fails is reported: the handler still answers, and nothing is shared", async () => {
    const reported: unknown[] = [];
    const backend = createBackend(withMaps({ greeter: [share(Greeted, () => { throw new Error("map down"); })] }), { reportError: error => { reported.push(error); } });
    const seen: unknown[] = [];
    backend.subscribe(published => seen.push(published));

    expect(await backend.send(new Greet("Ada"))).toBe("Hello Ada");

    expect(reported).toEqual([new Error("map down")]);
    expect(seen).toEqual([]);
  });

  test("a test watches the events of the contexts until it stops", async () => {
    const backend = createBackend(modules());
    const told: unknown[] = [];
    const stop = backend.subscribeToContexts(event => told.push(event));

    await backend.send(new Greet("Ada"));
    stop();
    await backend.send(new Greet("Bob"));

    expect(told).toEqual([new Greeted("Ada")]);
  });

  test("the handlers of the context shared publish its events on the shared bus: no context map shares them", async () => {
    const { contexts, ...rest } = modules();
    const announcer = { bindings: [], useCases: [{ input: Announce, handler: AnnounceHandler }], controllers: [], map: [] };
    const backend = createBackend({ ...rest, contexts: { ...contexts, shared: announcer } }, { nextEventId: () => "e1" });
    const seen: unknown[] = [];
    backend.subscribe(published => seen.push(published));

    expect(await backend.send(new Announce("Ada"), { correlationId: "req-1" })).toBe("announced Ada");
    await backend.settled();

    expect(seen).toEqual([{ event: new Arrived("Ada"), envelope: { eventId: "e1", correlationId: "req-1" } }]);
    expect(backend.get(Memory)).toEqual(["Ada@req-1"]);
  });
});

describe("a backend that runs while the server runs", () => {
  test("start runs each timer controller of each context at its rhythm, each turn in a request of its own", async () => {
    const clock = testClock();
    const backend = createBackend(withTimers([RememberTickController]), { schedule: clock.schedule });
    const memory = backend.get(Memory);
    backend.start();
    expect(clock.timers.map(({ every }) => every)).toEqual([1000]);

    clock.timers[0].turn();
    await vi.waitFor(() => { expect(memory).toHaveLength(1); });
    clock.timers[0].turn();
    await vi.waitFor(() => { expect(memory).toHaveLength(2); });
    await backend.stop();

    expect(memory.every(entry => /^tick@[0-9a-f-]{36}$/.test(entry))).toBe(true);
    expect(memory[0]).not.toBe(memory[1]);
  });

  test("a turn waits for the last one to end: the timer skips it", async () => {
    const clock = testClock();
    const backend = createBackend(withTimers([RememberTickController], SlowRememberHandler), { schedule: clock.schedule });
    backend.start();

    clock.timers[0].turn();
    await vi.waitFor(() => { expect(backend.get(Memory)).toEqual(["tick started"]); });
    clock.timers[0].turn();
    finishTurn();
    await vi.waitFor(() => { expect(backend.get(Memory)).toEqual(["tick started", "tick done"]); });
    clock.timers[0].turn();
    await vi.waitFor(() => { expect(backend.get(Memory)).toEqual(["tick started", "tick done", "tick started"]); });
    finishTurn();
    await backend.stop();
  });

  test("a turn whose controller cannot be built is reported: the next turn comes anyway", async () => {
    Flaky.builds = 0;
    const reported: unknown[] = [];
    const clock = testClock();
    const backend = createBackend(withTimers([FlakyTimerController]), { schedule: clock.schedule, reportError: error => { reported.push(error); } });
    backend.start();
    clock.timers[0].turn();
    await vi.waitFor(() => { expect(reported).toEqual([new Error("flaky")]); });
    clock.timers[0].turn();
    await vi.waitFor(() => { expect(reported).toEqual([new Error("flaky"), new Error("flaky")]); });
    await backend.stop();
  });

  test("start twice starts each timer once", () => {
    const clock = testClock();
    const backend = createBackend(withTimers([RememberTickController]), { schedule: clock.schedule });
    backend.start();
    backend.start();
    expect(clock.timers).toHaveLength(1);
  });

  test("a timer whose rhythm is not a number of milliseconds above 0, up to 2^31 - 1, is refused at start: no timer runs, and the next start refuses it again", () => {
    const clock = testClock();
    const backend = createBackend(withTimers([RememberTickController, BrokenTimerController]), { schedule: clock.schedule });
    const refusal = "BrokenTimerController runs every NaN ms, but its every is a number of milliseconds above 0, up to 2147483647 (24 days): Node runs a longer one every millisecond";
    expect(() => { backend.start(); }).toThrow(refusal);
    expect(clock.timers).toEqual([]);
    expect(() => { backend.start(); }).toThrow(refusal);
    const startEvery = (every: number) => () => { createBackend(withTimers([class EveryTimerController extends RememberTickController { override readonly every = every; }]), { schedule: testClock().schedule }).start(); };
    expect(startEvery(0)).toThrow("EveryTimerController runs every 0 ms");
    expect(startEvery(2 ** 31)).toThrow("EveryTimerController runs every 2147483648 ms");
    expect(startEvery(2 ** 31 - 1)).not.toThrow();
  });

  test("stop cancels the timers, waits for the turns that run, then releases what the contexts built, and last what shared built", async () => {
    released.length = 0;
    const clock = testClock();
    const { contexts, shared } = withTimers([RememberTickController], SlowRememberHandler);
    const backend = createBackend({
      shared: [...shared, bind(Box).toFactory(() => resource("shared"))],
      contexts: { ...contexts, memory: { ...contexts.memory, bindings: [...contexts.memory.bindings, bind(Lamp).toFactory(() => resource("memory"))] } }
    }, { schedule: clock.schedule });
    backend.get(Box);
    backend.get(Lamp);
    backend.start();
    clock.timers[0].turn();
    await vi.waitFor(() => { expect(backend.get(Memory)).toEqual(["tick started"]); });

    let stopped = false;
    const stopping = backend.stop().then(() => { stopped = true; });
    await new Promise(resolve => { setTimeout(resolve, 20); });
    expect(clock.timers[0].cancelled).toBe(true);
    expect(stopped).toBe(false);
    expect(released).toEqual([]);
    finishTurn();
    await stopping;

    expect(backend.get(Memory)).toEqual([]);
    expect(released).toEqual(["memory", "shared"]);
  });

  test("the events of the contexts end as soon as the backend stops, before it waits for anything: their signal aborts", async () => {
    const backend = withListener();
    const { context } = backend.controller(ListeningController);
    let requestsEnd: () => void = () => {};
    expect(context.signal.aborted).toBe(false);

    const stopping = backend.stop(new Promise<void>(resolve => { requestsEnd = resolve; }));

    expect(context.signal.aborted).toBe(true);
    requestsEnd();
    await stopping;
  });

  test("a turn of a timer stops as soon as the backend stops: its signal aborts; a reaction keeps its signal until the grace ends", async () => {
    const clock = testClock();
    const backend = createBackend(withTimers([RememberTickController], WatchfulRememberHandler), { schedule: clock.schedule });
    const memory = backend.get(Memory);
    backend.start();
    clock.timers[0].turn();
    await backend.send(new Greet("Ada"));
    await vi.waitFor(() => { expect(memory.toSorted()).toEqual(["Ada started", "tick started"]); });
    const grace = new AbortController();

    const stopping = backend.stop(Promise.resolve(), grace.signal);

    await vi.waitFor(() => { expect(memory).toContain("tick stopped"); });
    await new Promise(resolve => { setTimeout(resolve, 10); });
    expect(memory).not.toContain("Ada stopped");
    const timers = () => process.getActiveResourcesInfo().filter(resource => resource === "Timeout").length;
    const before = timers();
    grace.abort();
    await stopping;
    expect(memory).toContain("Ada stopped");
    // The second that the reactions get once the grace ends leaves no timer behind.
    expect(timers()).toBe(before);
  });

  test("a backend whose turns, requests and reactions end before the grace stops then, without waiting for the end of the grace", async () => {
    released.length = 0;
    const { contexts, shared } = modules();
    const backend = createBackend({ shared: [...shared, bind(Box).toFactory(() => resource("shared"))], contexts });
    backend.get(Box);
    await backend.send(new Greet("Ada"));
    await backend.stop(Promise.resolve(), new AbortController().signal);
    expect(released).toEqual(["shared"]);
  });

  test("once the grace ends, the turns and the reactions get one more second: then the backend reports those that still run, and releases", async () => {
    released.length = 0;
    const reported: unknown[] = [];
    const clock = testClock();
    const { contexts, shared } = withTimers([DeafTickController], WatchfulRememberHandler);
    const backend = createBackend({ shared: [...shared, bind(Box).toFactory(() => resource("shared"))], contexts }, { schedule: clock.schedule, reportError: error => { reported.push(error); } });
    backend.get(Box);
    const memory = backend.get(Memory);
    backend.start();
    clock.timers[0].turn();
    await backend.send(new Greet("deaf Ada"));
    await backend.send(new Greet("Bob"));
    await vi.waitFor(() => { expect(memory).toHaveLength(3); });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const stopping = backend.stop(new Promise(() => {}), AbortSignal.abort());
      await vi.advanceTimersByTimeAsync(999);
      expect(released).toEqual([]);
      expect(memory).toContain("Bob stopped");
      await vi.advanceTimersByTimeAsync(1);
      await stopping;
    } finally {
      vi.useRealTimers();
    }
    expect(released).toEqual(["shared"]);
    expect(reported).toEqual([new Error("The backend stopped before these ended: a turn of DeafTickController, a reaction with Remember")]);
  });

  test("once the grace ends, a request that still runs is the server's: the backend releases one second later, and reports nothing", async () => {
    released.length = 0;
    const reported: unknown[] = [];
    const { contexts, shared } = modules();
    const backend = createBackend({ shared: [...shared, bind(Box).toFactory(() => resource("shared"))], contexts }, { reportError: error => { reported.push(error); } });
    backend.get(Box);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const stopping = backend.stop(new Promise(() => {}), AbortSignal.abort());
      await vi.advanceTimersByTimeAsync(1000);
      await stopping;
    } finally {
      vi.useRealTimers();
    }
    expect(released).toEqual(["shared"]);
    expect(reported).toEqual([]);
  });

  test("stop waits for the requests that the server still serves before it releases", async () => {
    released.length = 0;
    const { contexts, shared } = modules();
    const backend = createBackend({ shared: [...shared, bind(Box).toFactory(() => resource("shared"))], contexts });
    backend.get(Box);
    let requestsEnd: () => void = () => {};
    const stopping = backend.stop(new Promise<void>(resolve => { requestsEnd = resolve; }));
    await new Promise(resolve => { setTimeout(resolve, 10); });
    expect(released).toEqual([]);
    requestsEnd();
    await stopping;
    expect(released).toEqual(["shared"]);
  });

  test("a resource that fails to release is reported, and the others are released", async () => {
    released.length = 0;
    const reported: unknown[] = [];
    const { contexts, shared } = modules();
    const backend = createBackend({
      shared: [...shared, bind(Box).toFactory(() => resource("shared"))],
      contexts: { ...contexts, memory: { ...contexts.memory, bindings: [bind(Memory).toFactory(() => ({ [Symbol.asyncDispose]: () => Promise.reject(new Error("stuck")) }) as unknown as Memory)] } }
    }, { reportError: error => { reported.push(error); } });
    backend.get(Box);
    backend.get(Memory);
    await backend.stop();
    expect(released).toEqual(["shared"]);
    expect(reported).toEqual([new AggregateError([new Error("stuck")], "1 instance failed to release")]);
  });

  test("without a clock, the timers of Node run it", async () => {
    vi.useFakeTimers();
    try {
      const backend = createBackend(withTimers([RememberTickController]));
      const memory = backend.get(Memory);
      backend.start();
      await vi.advanceTimersByTimeAsync(2500);
      await backend.stop();
      await vi.advanceTimersByTimeAsync(5000);
      expect(memory).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the events that a controller hears", () => {
  test("a request hears the events that its own handlers publish, until it stops listening: not those of another request", async () => {
    const backend = withListener();
    const first = backend.controller(ListeningController, { correlationId: "r1" });
    const heard: unknown[] = [];
    const stop = first.request.subscribe(event => heard.push(event));

    await first.bus.send(new Greet("Ada"));
    await backend.controller(ListeningController, { correlationId: "r2" }).bus.send(new Greet("Bob"));
    stop();
    await first.bus.send(new Greet("Cy"));

    expect(heard).toEqual([new Greeted("Ada")]);
  });

  test("a context hears the events of its handlers in every request, until it stops listening: not those of another context", async () => {
    const backend = withListener();
    const listening = backend.controller(ListeningController, { correlationId: "r1" });
    const heard: unknown[] = [];
    const stop = listening.context.subscribe(event => heard.push(event));

    await backend.send(new Greet("Ada"));
    await backend.controller(ListeningController, { correlationId: "r2" }).bus.send(new Greet("Bob"));
    await backend.send(new Remember("Cy"));
    stop();
    await backend.send(new Greet("Dan"));

    expect(heard).toEqual([new Greeted("Ada"), new Greeted("Bob")]);
  });

  test("a test gives its own: the controllers hear what the test publishes", () => {
    const request: RequestEvents = { subscribe: () => () => {} };
    const context: ContextEvents = { subscribe: () => () => {}, signal: new AbortController().signal };
    const listening = withListener({ replace: { shared: [bind(RequestEvents).toValue(request), bind(ContextEvents).toValue(context)] } })
      .controller(ListeningController);
    expect([listening.request, listening.context]).toEqual([request, context]);
    expect(listening.request).toBe(request);
    expect(listening.context).toBe(context);
  });
});
