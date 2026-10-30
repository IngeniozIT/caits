import { getEventListeners } from "node:events";
import { describe, expect, test, vi } from "vitest";
import { DomainEvent } from "../DomainEvent.js";
import { InvalidInputError } from "./Controller.js";
import type { ContextEvents } from "./ContextEvents.js";
import type { MessageBus } from "./MessageBus.js";
import { sseComment, sseEvent } from "./sse.js";
import { StreamController } from "./StreamController.js";
import type { Request } from "./Request.js";

class Ask { constructor(readonly question: string) {} }
class Said extends DomainEvent { constructor(readonly word: string) { super(); } }
class Thought extends DomainEvent { constructor(readonly idea: string) { super(); } }

/** Streams the words that its handler says, then the number of words. */
class AnswerStreamController extends StreamController<Ask, number> {
  protected override readonly keepAliveMs: number = 30;

  protected toDto(request: Request): Ask {
    const question = new URL(request.url).searchParams.get("q");
    if (question === null) throw new InvalidInputError("no question");
    if (question === "secret") throw new RangeError("not that one");
    return new Ask(question);
  }

  protected toChunk(event: DomainEvent): string | undefined {
    if (event instanceof Thought && event.idea === "broken") throw new Error("cannot write");
    return event instanceof Said ? sseEvent(event.word) : undefined;
  }

  protected toOutputChunk(output: number): string | undefined {
    return output === 0 ? undefined : sseEvent(`${output} words`, { event: "end" });
  }

  /** A question that starts with "whole" asks for the whole answer at once. */
  protected override streams(dto: Ask): boolean {
    return !dto.question.startsWith("whole");
  }

  protected override toResponse(output: number): Response {
    if (output < 0) throw new Error("cannot answer");
    return Response.json({ words: output }, { status: 201 });
  }

  protected override toErrorResponse(error: unknown, request: Request): Response | Promise<Response> {
    if (error instanceof RangeError) return new Response(error.message, { status: 403 });
    return super.toErrorResponse(error, request);
  }
}

/** Streams the state of the context, then what happens in it, until its client leaves. */
class FeedStreamController extends AnswerStreamController {
  protected override readonly follows = "context";
}

/** A feed whose state, a number of words, holds the word said before it that names this number. */
class HoldingFeedStreamController extends FeedStreamController {
  protected override stateHolds(state: number, event: DomainEvent): boolean {
    if (event instanceof Thought) throw new Error("cannot tell");
    return event instanceof Said && event.word === `word ${state}`;
  }
}

/** A stream of a request whose state would hold every event. */
class HoldingAnswerStreamController extends AnswerStreamController {
  protected override stateHolds(): boolean {
    return true;
  }
}

/** A controller whose comment of keep-alive fails. */
class BrokenKeepAliveStreamController extends AnswerStreamController {
  protected override toKeepAlive(): string {
    throw new Error("cannot keep alive");
  }
}

/** A controller that cannot write an error in the stream. */
class MuteErrorStreamController extends AnswerStreamController {
  protected override toErrorChunk(): string {
    throw new Error("cannot explain");
  }
}

/** A controller with the defaults: it writes the words, and nothing for the output. */
class PlainStreamController extends StreamController<Ask, number> {
  protected toDto(): Ask { return new Ask("plain"); }
  protected toChunk(event: DomainEvent): string | undefined { return event instanceof Said ? sseEvent(event.word) : undefined; }
  protected toOutputChunk(): string | undefined { return undefined; }
}

/** A controller with the defaults, for a request that asks for no stream: the output in JSON. */
class WholeStreamController extends PlainStreamController {
  protected override streams(): boolean { return false; }
}

/** The events of the tests: the handler and the test publish them, and the test ends them, as the backend stops. */
function hub(): ContextEvents & { publish(event: DomainEvent): void; listening(): number; end(): void } {
  const listeners = new Set<(event: DomainEvent) => void>();
  const ended = new AbortController();
  return {
    publish: event => { for (const listener of [...listeners]) listener(event); },
    listening: () => listeners.size,
    signal: ended.signal,
    end: () => { ended.abort(); },
    subscribe: listener => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    }
  };
}

/** A controller over a bus whose handler of Ask the test writes, with the events of its request and of its context. */
function setUp(handle: (dto: Ask, events: ReturnType<typeof hub>) => Promise<number>, type: typeof AnswerStreamController = AnswerStreamController) {
  const request = hub();
  const context = hub();
  const sent: object[] = [];
  /** The signal that went with each DTO: its handler reads it. */
  const signals: (AbortSignal | undefined)[] = [];
  const reported: unknown[] = [];
  const bus: MessageBus = { send: (dto: object, sending) => {
    sent.push(dto);
    signals.push(sending?.signal);
    return handle(dto as Ask, type === FeedStreamController || type.prototype instanceof FeedStreamController ? context : request);
  } };
  return { request, context, sent, signals, reported, controller: new type(bus, request, context, error => reported.push(error)) };
}

/** The event of an error in the stream, by default. */
const failure = sseEvent('{"title":"Internal server error"}', { event: "problem" });
const ask = (question?: string, signal?: AbortSignal) => new globalThis.Request(`http://localhost/answer${question === undefined ? "" : `?q=${question}`}`, { signal });
const text = (response: Response) => response.text();

describe("StreamController", () => {
  test("streams what the handler of its request publishes, as it publishes it, then its output, and ends", async () => {
    const { controller } = setUp(async (_dto, events) => {
      events.publish(new Said("Hello"));
      await new Promise(resolve => { setTimeout(resolve, 5); });
      events.publish(new Thought("ignored"));
      events.publish(new Said("world"));
      return 2;
    });
    const response = await controller.handle(ask("greet"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-cache, no-transform");
    const chunks: string[] = [];
    for await (const chunk of response.body!) chunks.push(new TextDecoder().decode(chunk));
    expect(chunks).toEqual([sseEvent("Hello"), sseEvent("world"), sseEvent("2 words", { event: "end" })]);
  });

  test("an output with no text ends the stream without a word, and it listens no more", async () => {
    const { controller, request } = setUp(async (_dto, events) => {
      events.publish(new Said("Hi"));
      return 0;
    });
    expect(await text(await controller.handle(ask("greet")))).toBe(sseEvent("Hi"));
    expect(request.listening()).toBe(0);
  });

  test("an error before the first event is a response, as a Controller gives it", async () => {
    const { controller, reported, request } = setUp(() => Promise.reject(new RangeError("refused")));
    const refused = await controller.handle(ask("greet"));
    expect([refused.status, await refused.text()]).toEqual([403, "refused"]);
    expect(request.listening()).toBe(0);

    const failing = setUp(() => Promise.reject(new Error("disk full")));
    const failed = await failing.controller.handle(ask("greet"));
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ type: "urn:caits:problem:internal-server-error", title: "Internal server error", status: 500 });
    expect(failing.reported).toEqual([new Error("disk full")]);
    expect(reported).toEqual([]);
  });

  test("a request that toDto refuses is a response, and sends nothing", async () => {
    const { controller, sent } = setUp(() => Promise.resolve(1));
    expect((await controller.handle(ask())).status).toBe(422);
    expect((await controller.handle(ask("secret"))).status).toBe(403);
    expect(sent).toEqual([]);
  });

  test("an error once the stream started goes in the stream, which ends; the error is reported, and the signal of the handler that ended stays", async () => {
    const { controller, reported, signals } = setUp((_dto, events) => {
      events.publish(new Said("Hello"));
      return Promise.reject(new Error("model crashed"));
    });
    expect(await text(await controller.handle(ask("greet")))).toBe(`${sseEvent("Hello")}${failure}`);
    expect(reported).toEqual([new Error("model crashed")]);
    expect(signals.map(signal => signal?.aborted)).toEqual([false]);
  });

  test("an event that it cannot write is an error in the stream, which ends; the signal of the DTO aborts: the handler stops", async () => {
    const { controller, reported, signals, request } = setUp((_dto, events) => {
      events.publish(new Said("Hello"));
      events.publish(new Thought("broken"));
      events.publish(new Said("never"));
      return new Promise(() => {});
    });
    expect(await text(await controller.handle(ask("greet")))).toBe(`${sseEvent("Hello")}${failure}`);
    expect(reported).toEqual([new Error("cannot write")]);
    expect(signals.map(signal => signal?.aborted)).toEqual([true]);
    expect(request.listening()).toBe(0);
  });

  test("an error that it cannot write in the stream is reported with the error of toErrorChunk; the stream ends", async () => {
    const crashing = setUp((_dto, events) => {
      events.publish(new Said("Hello"));
      return Promise.reject(new Error("model crashed"));
    }, MuteErrorStreamController);
    expect(await text(await crashing.controller.handle(ask("greet")))).toBe(sseEvent("Hello"));
    expect(crashing.reported).toEqual([new Error("model crashed"), new Error("cannot explain")]);

    const breaking = setUp((_dto, events) => {
      events.publish(new Said("Hello"));
      events.publish(new Thought("broken"));
      return new Promise(() => {});
    }, MuteErrorStreamController);
    expect(await text(await breaking.controller.handle(ask("greet")))).toBe(sseEvent("Hello"));
    expect(breaking.reported).toEqual([new Error("cannot write"), new Error("cannot explain")]);
    expect(breaking.signals.map(signal => signal?.aborted)).toEqual([true]);
  });

  test("a stream that says nothing for a while writes a comment, which keeps the connection alive", async () => {
    let answer: (words: number) => void = () => {};
    const { controller } = setUp((_dto, events) => {
      events.publish(new Said("Hmm"));
      return new Promise(resolve => { answer = resolve; });
    });
    const response = await controller.handle(ask("think"));
    await new Promise(resolve => { setTimeout(resolve, 50); });
    answer(1);
    expect(await text(response)).toBe(`${sseEvent("Hmm")}${sseComment("keep-alive")}${sseEvent("1 words", { event: "end" })}`);
  });

  test("an event that it does not write keeps nothing alive: the comment comes all the same", async () => {
    vi.useFakeTimers();
    try {
      let answer: (words: number) => void = () => {};
      const { controller, request } = setUp((_dto, events) => {
        events.publish(new Said("Hmm"));
        return new Promise(resolve => { answer = resolve; });
      });
      const response = await controller.handle(ask("think"));
      for (let elapsed = 0; elapsed < 100; elapsed += 10) {
        await vi.advanceTimersByTimeAsync(10);
        request.publish(new Thought("unwritten"));
      }
      answer(1);
      expect(await text(response)).toBe(`${sseEvent("Hmm")}${sseComment("keep-alive").repeat(3)}${sseEvent("1 words", { event: "end" })}`);
    } finally {
      vi.useRealTimers();
    }
  });

  test("a feed whose start writes nothing keeps its connection alive from its start", async () => {
    vi.useFakeTimers();
    try {
      const { controller } = setUp(() => Promise.resolve(0), FeedStreamController);
      const reader = (await controller.handle(ask("state"))).body!.getReader();
      await vi.advanceTimersByTimeAsync(30);
      expect(new TextDecoder().decode((await reader.read()).value)).toBe(sseComment("keep-alive"));
      await reader.cancel();
    } finally {
      vi.useRealTimers();
    }
  });

  test("a comment of keep-alive that fails is an error in the stream, which ends; the signal of the DTO aborts", async () => {
    const { controller, reported, signals } = setUp((_dto, events) => {
      events.publish(new Said("Hmm"));
      return new Promise(() => {});
    }, BrokenKeepAliveStreamController);
    expect(await text(await controller.handle(ask("think")))).toBe(`${sseEvent("Hmm")}${failure}`);
    expect(reported).toEqual([new Error("cannot keep alive")]);
    expect(signals.map(signal => signal?.aborted)).toEqual([true]);
  });

  test("a client that leaves before the handler answers: the stream stops, it listens no more, and the signal of the DTO aborts", async () => {
    const { controller, sent, signals, reported, request } = setUp((_dto, events) => {
      events.publish(new Said("Hello"));
      return new Promise(() => {});
    });
    const leaving = new AbortController();
    const response = await controller.handle(ask("long", leaving.signal));
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe(sseEvent("Hello"));
    expect(signals.map(signal => signal?.aborted)).toEqual([false]);
    leaving.abort();
    expect(signals.map(signal => signal?.aborted)).toEqual([true]);
    expect(request.listening()).toBe(0);
    await reader.cancel();
    expect(sent).toEqual([new Ask("long")]);
    expect(reported).toEqual([]);
  });

  test("a client that leaves before the first event: the signal of the DTO aborts at once, it listens no more, and waits for nothing", async () => {
    const { controller, signals, request } = setUp(() => new Promise(() => {}));
    const leaving = new AbortController();
    const handling = controller.handle(ask("long", leaving.signal));
    await vi.waitFor(() => { expect(signals).toHaveLength(1); });

    leaving.abort();

    expect(signals.map(signal => signal?.aborted)).toEqual([true]);
    expect((await handling).status).toBe(499);
    expect(request.listening()).toBe(0);
  });

  test("a client that left before its request reached the stream: its DTO goes with an aborted signal; a feed does the same", async () => {
    for (const type of [AnswerStreamController, FeedStreamController]) {
      const { controller, signals, context } = setUp(() => new Promise(() => {}), type);
      const leaving = new AbortController();
      leaving.abort();
      expect((await controller.handle(ask("long", leaving.signal))).status).toBe(499);
      expect(signals.map(signal => signal?.aborted)).toEqual([true]);
      expect(context.listening()).toBe(0);
    }
  });

  test("a client that cancels its reading leaves too: the signal of the DTO aborts, though the request does not", async () => {
    const { controller, signals, request } = setUp((_dto, events) => {
      events.publish(new Said("Hello"));
      return new Promise(() => {});
    });
    await (await controller.handle(ask("long"))).body!.cancel();
    expect(signals.map(signal => signal?.aborted)).toEqual([true]);
    expect(request.listening()).toBe(0);
  });

  test("by default, each request asks for a stream; a client that cancels its reading aborts the signal of its DTO, and sends nothing more", async () => {
    const request = hub();
    const sent: object[] = [];
    const signals: (AbortSignal | undefined)[] = [];
    const bus: MessageBus = { send: (dto: object, sending) => {
      sent.push(dto);
      signals.push(sending?.signal);
      request.publish(new Said("Hello"));
      return new Promise(() => {});
    } };
    const response = await new PlainStreamController(bus, request, request).handle(ask("plain"));
    expect(response.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    await response.body!.cancel();
    expect(sent).toEqual([new Ask("plain")]);
    expect(signals.map(signal => signal?.aborted)).toEqual([true]);
  });

  test("a client that leaves after the handler answered sends nothing more", async () => {
    const { controller, sent, signals } = setUp(() => Promise.resolve(1));
    const leaving = new AbortController();
    const response = await controller.handle(ask("short", leaving.signal));
    await text(response);
    expect(signals.map(signal => signal?.aborted)).toEqual([false]);
    leaving.abort();
    expect(sent).toEqual([new Ask("short")]);
  });

  test("a feed writes the output of its handler first, then the events of its context that came before, then those that come, until the client leaves", async () => {
    const { controller, context, sent } = setUp(async (_dto, events) => {
      events.publish(new Said("before the state"));
      return 5;
    }, FeedStreamController);
    const leaving = new AbortController();
    const response = await controller.handle(ask("follow", leaving.signal));
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let read = "";
    const expected = `${sseEvent("5 words", { event: "end" })}${sseEvent("before the state")}${sseEvent("later")}`;
    context.publish(new Said("later"));
    while (read.length < expected.length) read += decoder.decode((await reader.read()).value);
    expect(read).toBe(expected);
    leaving.abort();
    context.publish(new Said("after the client left"));
    await reader.cancel();
    expect(sent).toEqual([new Ask("follow")]);
  });

  test("a feed writes an event that came before its state only when the state does not hold it; it writes each event that comes after", async () => {
    const { controller, context } = setUp(async (_dto, events) => {
      events.publish(new Said("word 5"));
      events.publish(new Said("word 6"));
      return 5;
    }, HoldingFeedStreamController);
    const leaving = new AbortController();
    const reader = (await controller.handle(ask("follow", leaving.signal))).body!.getReader();
    const decoder = new TextDecoder();
    let read = "";
    const expected = `${sseEvent("5 words", { event: "end" })}${sseEvent("word 6")}${sseEvent("word 5")}`;
    context.publish(new Said("word 5"));
    while (read.length < expected.length) read += decoder.decode((await reader.read()).value);
    expect(read).toBe(expected);
    leaving.abort();
    await reader.cancel();
  });

  test("a feed that cannot tell whether its state holds an event writes the error, and ends", async () => {
    const { controller, context, reported } = setUp(async (_dto, events) => {
      events.publish(new Thought("unclear"));
      return 5;
    }, HoldingFeedStreamController);
    expect(await text(await controller.handle(ask("follow")))).toBe(`${sseEvent("5 words", { event: "end" })}${failure}`);
    expect(reported).toEqual([new Error("cannot tell")]);
    expect(context.listening()).toBe(0);
  });

  test("a stream of a request has no state: it writes each event", async () => {
    const { controller } = setUp(async (_dto, events) => {
      events.publish(new Said("Hello"));
      return 1;
    }, HoldingAnswerStreamController);
    expect(await text(await controller.handle(ask("greet")))).toBe(`${sseEvent("Hello")}${sseEvent("1 words", { event: "end" })}`);
  });

  test("a feed ends when the events of its context end, as the backend stops: its client comes back to the next backend", async () => {
    const { controller, context } = setUp(() => Promise.resolve(5), FeedStreamController);
    const reader = (await controller.handle(ask("follow"))).body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe(sseEvent("5 words", { event: "end" }));

    context.end();

    expect(await reader.read()).toEqual({ done: true, value: undefined });
    expect(context.listening()).toBe(0);
  });

  test("a feed that starts once the backend stopped writes its state and the events that came before it, then ends", async () => {
    const { controller, context } = setUp(async (_dto, events) => {
      events.publish(new Said("before the state"));
      return 5;
    }, FeedStreamController);
    context.end();
    expect(await text(await controller.handle(ask("follow")))).toBe(`${sseEvent("5 words", { event: "end" })}${sseEvent("before the state")}`);
    expect(context.listening()).toBe(0);
  });

  test("a feed that ended, as its client left or it failed, does nothing more when the backend stops", async () => {
    const leaving = setUp(() => Promise.resolve(5), FeedStreamController);
    const reader = (await leaving.controller.handle(ask("follow"))).body!.getReader();
    await reader.read();
    await reader.cancel();
    leaving.context.end();

    const failing = setUp(async (_dto, events) => {
      events.publish(new Thought("unclear"));
      return 5;
    }, HoldingFeedStreamController);
    failing.context.end();
    const response = await failing.controller.handle(ask("follow"));
    expect([response.status, await text(response)]).toEqual([200, `${sseEvent("5 words", { event: "end" })}${failure}`]);
    expect(failing.reported).toEqual([new Error("cannot tell")]);
  });

  test("a stream of a request goes on when the backend stops: it gets the grace that the server gives each request", async () => {
    let answer: (words: number) => void = () => {};
    const { controller, context } = setUp((_dto, events) => {
      events.publish(new Said("Hello"));
      return new Promise(resolve => { answer = resolve; });
    });
    const response = await controller.handle(ask("long"));
    context.end();
    answer(1);
    expect(await text(response)).toBe(`${sseEvent("Hello")}${sseEvent("1 words", { event: "end" })}`);
  });

  test("a stream that ends leaves no timer behind, and a feed no listener on the events of its context", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const answering = setUp(async (_dto, events) => {
        events.publish(new Said("Hello"));
        return 1;
      });
      await text(await answering.controller.handle(ask("greet")));
      expect(vi.getTimerCount()).toBe(0);

      const following = setUp(() => Promise.resolve(5), FeedStreamController);
      const reader = (await following.controller.handle(ask("follow"))).body!.getReader();
      await reader.read();
      await reader.cancel();
      expect(vi.getTimerCount()).toBe(0);
      expect(getEventListeners(following.context.signal, "abort")).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("a feed whose handler fails is a response", async () => {
    const { controller } = setUp(() => Promise.reject(new RangeError("no feed")), FeedStreamController);
    expect((await controller.handle(ask("follow"))).status).toBe(403);
  });

  test("a request that asks for no stream gets the response to the output, once the handler answers: it listens to no event", async () => {
    const { controller, request } = setUp(async (_dto, events) => {
      events.publish(new Said("unheard"));
      await new Promise(resolve => { setTimeout(resolve, 5); });
      expect(events.listening()).toBe(0);
      return 2;
    });
    const response = await controller.handle(ask("whole"));
    expect([response.status, await response.json()]).toEqual([201, { words: 2 }]);
    expect(request.listening()).toBe(0);
  });

  test("by default, the response to the output is its JSON", async () => {
    const request = hub();
    const bus: MessageBus = { send: () => Promise.resolve({ words: 3 }) };
    const response = await new WholeStreamController(bus, request, request).handle(ask("plain"));
    expect([response.status, response.headers.get("content-type"), await response.json()]).toEqual([200, "application/json", { words: 3 }]);
  });

  test("a request that asks for no stream: an error is a response, as a Controller gives it", async () => {
    const { controller } = setUp(() => Promise.reject(new RangeError("refused")));
    const refused = await controller.handle(ask("whole"));
    expect([refused.status, await refused.text()]).toEqual([403, "refused"]);
  });

  test("a request that asks for no stream: a response that it cannot give, or an error that it cannot answer, is reported", async () => {
    const { controller, reported } = setUp(() => Promise.resolve(-1));
    const failed = await controller.handle(ask("whole"));
    expect([failed.status, await failed.json()]).toEqual([500, { type: "urn:caits:problem:internal-server-error", title: "Internal server error", status: 500 }]);
    expect(reported).toEqual([new Error("cannot answer")]);

    const failing = setUp(() => Promise.reject(new Error("model crashed")));
    const toErrorResponse = vi.spyOn(failing.controller as unknown as { toErrorResponse: () => never }, "toErrorResponse").mockImplementation(() => { throw new Error("cannot explain"); });
    expect((await failing.controller.handle(ask("whole"))).status).toBe(500);
    expect(toErrorResponse).toHaveBeenCalledOnce();
    expect(failing.reported).toEqual([new Error("cannot explain")]);
  });

  test("a request that asks for no stream: its DTO goes with the signal of its request, which aborts when the client leaves", async () => {
    let answer: (words: number) => void = () => {};
    const { controller, sent, signals } = setUp(() => new Promise(resolve => { answer = resolve; }));
    const leaving = new AbortController();
    const answering = controller.handle(ask("whole long", leaving.signal));
    await vi.waitFor(() => { expect(sent).toEqual([new Ask("whole long")]); });
    expect(signals.map(signal => signal?.aborted)).toEqual([false]);
    leaving.abort();
    expect(signals.map(signal => signal?.aborted)).toEqual([true]);
    answer(1);
    expect((await answering).status).toBe(201);
  });

  test("an error that toErrorResponse cannot answer is a 500, which is reported, as from a Controller", async () => {
    const { controller, reported } = setUp(() => Promise.reject(new Error("model crashed")));
    vi.spyOn(controller as unknown as { toErrorResponse: () => never }, "toErrorResponse").mockImplementation(() => { throw new Error("cannot explain"); });
    const failed = await controller.handle(ask("long"));
    expect([failed.status, await failed.json()]).toEqual([500, { type: "urn:caits:problem:internal-server-error", title: "Internal server error", status: 500 }]);
    expect((await controller.handle(ask())).status).toBe(500);
    expect(reported).toEqual([new Error("cannot explain"), new Error("cannot explain")]);
  });

  test("a controller that answers an error itself can report it, as CAITS reports the errors that it does not know", async () => {
    class ReportingStreamController extends AnswerStreamController {
      protected override toErrorResponse(error: unknown): Response {
        this.reportError(error);
        return new Response(null, { status: 502 });
      }
    }
    const { controller, reported } = setUp(() => Promise.reject(new Error("upstream")), ReportingStreamController);
    expect((await controller.handle(ask("long"))).status).toBe(502);
    expect(reported).toEqual([new Error("upstream")]);
  });

  test("reports to the console when nobody says where", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const request = hub();
      const bus: MessageBus = { send: () => Promise.reject(new Error("lost")) };
      const response = await new AnswerStreamController(bus, request, request).handle(ask("greet"));
      expect(response.status).toBe(500);
      expect(error).toHaveBeenCalledWith(new Error("lost"));
    } finally {
      error.mockRestore();
    }
  });
});
