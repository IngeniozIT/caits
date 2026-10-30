import { EventEmitter } from "node:events";
import { connect } from "node:net";
import { Agent, request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import { describe, expect, test, vi } from "vitest";
import { serve, stopOnSignals } from "./serve.js";

/**
 * What the backend of a test did, in order: each boot and each stop, and when the requests that its stop waited for were done; and the
 * end of the grace that each stop got, with whether it had come when the stop started.
 */
function testBackend() {
  const done: string[] = [];
  const graces: { signal: AbortSignal; overAtStart: boolean }[] = [];
  let boots = 0;
  const boot = async () => {
    const number = ++boots;
    done.push(`boot ${number}`);
    return async (requestsDone: Promise<unknown>, graceOver: AbortSignal) => {
      done.push(`stop ${number}`);
      graces.push({ signal: graceOver, overAtStart: graceOver.aborted });
      await requestsDone;
      done.push(`stopped ${number}`);
    };
  };
  return { done, graces, boot };
}

const answer = (text: string) => (_request: IncomingMessage, response: ServerResponse) => { response.end(text); };
const url = (port: number) => `http://127.0.0.1:${port}/`;

describe("serve", () => {
  test("boots the backend, then serves the requests on its port", async () => {
    const backend = testBackend();
    const served = await serve({ handle: answer("hello"), port: 0, boot: backend.boot });

    expect(backend.done).toEqual(["boot 1"]);
    expect(await (await fetch(url(served.port))).text()).toBe("hello");
    await served.close();
  });

  test("reboot stops the backend, then boots it again: never two backends at once, even when two reboots come together", async () => {
    const backend = testBackend();
    const served = await serve({ handle: answer("hello"), port: 0, boot: backend.boot });

    await Promise.all([served.reboot(), served.reboot()]);

    expect(backend.done).toEqual(["boot 1", "stop 1", "stopped 1", "boot 2", "stop 2", "stopped 2", "boot 3"]);
    // A reboot lets no request end: the stop gets no grace.
    expect(backend.graces.map(grace => grace.overAtStart)).toEqual([true, true]);
    await served.close();
  });

  test("close serves no new request, and stops the backend once the requests that run end", async () => {
    const backend = testBackend();
    let respond: (() => void) | undefined;
    const served = await serve({
      handle: (_request, response) => { respond = () => { response.end("late"); }; },
      port: 0,
      boot: backend.boot
    });
    const running = fetch(url(served.port)).then(response => response.text());
    await expect.poll(() => respond).toBeDefined();

    const closing = served.close();
    await new Promise(resolve => { setTimeout(resolve, 20); });
    expect(backend.done).toEqual(["boot 1", "stop 1"]);
    await expect(fetch(url(served.port))).rejects.toThrow();

    respond?.();
    expect(await running).toBe("late");
    await closing;
    expect(backend.done).toEqual(["boot 1", "stop 1", "stopped 1"]);
  });

  test("while the server runs, a connection stays open between two requests", async () => {
    const ports: (number | undefined)[] = [];
    const served = await serve({ handle: (request, response) => { ports.push(request.socket.remotePort); response.end("hello"); }, port: 0, boot: testBackend().boot });
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    const get = () => new Promise<void>((resolve, reject) => {
      httpRequest({ port: served.port, agent }, response => { response.resume().on("end", resolve); }).on("error", reject).end();
    });

    await get();
    await get();

    expect(ports).toHaveLength(2);
    expect(ports[1]).toBe(ports[0]);
    agent.destroy();
    await served.close();
  });

  test("a stream that ends while the server closes closes its connection: the close does not wait for the client to let it go", async () => {
    let respond: (() => void) | undefined;
    const served = await serve({
      handle: (_request, response) => {
        // The stream starts before the server closes: its headers say that the connection stays open.
        response.writeHead(200).write("the start, ");
        respond = () => { response.end("the end"); };
      },
      port: 0,
      boot: testBackend().boot
    });
    // An agent that keeps its connections open, as long as the server keeps them: 5 s after the last response, for Node.
    const agent = new Agent({ keepAlive: true });
    const answered = new Promise<string>((resolve, reject) => {
      httpRequest({ port: served.port, agent }, response => {
        let text = "";
        response.on("data", chunk => { text += chunk; }).on("end", () => { resolve(text); });
      }).on("error", reject).end();
    });
    await expect.poll(() => respond).toBeDefined();

    const closing = served.close();
    await new Promise(resolve => { setTimeout(resolve, 20); });
    respond?.();

    expect(await answered).toBe("the start, the end");
    expect(await Promise.race([closing.then(() => "closed"), new Promise(resolve => { setTimeout(resolve, 2000, "still open"); })])).toBe("closed");
    agent.destroy();
  });

  test("a request that comes while the server closes, on a connection that still serves another, gets a 503 that closes the connection", async () => {
    const handled: string[] = [];
    let respond: () => void = () => {};
    const served = await serve({
      handle: (request, response) => {
        handled.push(String(request.url));
        if (request.url === "/first") respond = () => { response.end("first"); };
        else response.end("second");
      },
      port: 0,
      boot: testBackend().boot
    });
    const socket = connect(served.port, "127.0.0.1");
    let received = "";
    socket.on("data", chunk => { received += String(chunk); });
    const ended = new Promise(resolve => { socket.on("close", resolve); });
    socket.write("GET /first HTTP/1.1\r\nHost: localhost\r\n\r\n");
    await expect.poll(() => handled).toEqual(["/first"]);

    const closing = served.close();
    await new Promise(resolve => { setTimeout(resolve, 20); });
    // The client sends its next request without waiting for the response to the first, on the same connection.
    socket.write("GET /second HTTP/1.1\r\nHost: localhost\r\n\r\n");
    await new Promise(resolve => { setTimeout(resolve, 20); });
    respond();
    await ended;

    const [, second = ""] = received.split(/(?=HTTP\/1\.1 )/);
    expect(received).toMatch(/^HTTP\/1\.1 200 OK\r\n[^]*\r\n\r\nfirstHTTP/);
    expect(second).toMatch(/^HTTP\/1\.1 503 Service Unavailable\r\n/);
    expect(second).toMatch(/\r\nConnection: close\r\n/i);
    expect(handled).toEqual(["/first"]);
    await closing;
  });

  test("a request that comes during a reboot waits for the new backend", async () => {
    const done: string[] = [];
    let booted: () => void = () => {};
    let boots = 0;
    const served = await serve({
      handle: (_request, response) => { done.push("request"); response.end("hello"); },
      port: 0,
      boot: async () => {
        done.push(`boot ${++boots}`);
        if (boots === 2) await new Promise<void>(resolve => { booted = resolve; });
        return async () => { done.push("stop"); };
      }
    });
    const rebooting = served.reboot();
    await expect.poll(() => done).toEqual(["boot 1", "stop", "boot 2"]);

    let sent = false;
    const answering = new Promise<string>((resolve, reject) => {
      httpRequest({ port: served.port }, response => {
        let text = "";
        response.on("data", chunk => { text += chunk; }).on("end", () => { resolve(text); });
      }).on("error", reject).on("finish", () => { sent = true; }).end();
    });
    // The request has left the client, then the server has had the time to read it: a request still on its way would wait for nothing.
    await expect.poll(() => sent).toBe(true);
    await new Promise(resolve => { setTimeout(resolve, 20); });
    expect(done).toEqual(["boot 1", "stop", "boot 2"]);
    booted();
    expect(await answering).toBe("hello");
    await rebooting;
    expect(done).toEqual(["boot 1", "stop", "boot 2", "request"]);
    await served.close();
  });

  test("a reboot whose boot fails reports the error and serves on: the next reboot boots again", async () => {
    const done: string[] = [];
    const reported: unknown[] = [];
    let boots = 0;
    const served = await serve({
      handle: answer("hello"),
      port: 0,
      boot: async () => {
        done.push(`boot ${++boots}`);
        if (boots === 2) throw new SyntaxError("a typo");
        return async () => { done.push(`stop ${boots}`); };
      },
      reportError: error => { reported.push(error); }
    });

    await served.reboot();
    expect(reported).toEqual([new SyntaxError("a typo")]);
    expect(await (await fetch(url(served.port))).text()).toBe("hello");
    await served.reboot();
    await served.close();

    expect(done).toEqual(["boot 1", "stop 1", "boot 2", "boot 3", "stop 3"]);
  });

  test("by default, a boot that fails at a reboot is reported on the console", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      let boots = 0;
      const served = await serve({ handle: answer("hello"), port: 0, boot: async () => {
        if (++boots === 2) throw new SyntaxError("a typo");
        return async () => {};
      } });
      await served.reboot();
      await served.close();
      expect(error).toHaveBeenCalledWith(new SyntaxError("a typo"));
    } finally {
      error.mockRestore();
    }
  });

  test("a response that runs past the grace, as a stream, has its connection closed: the backend stops anyway", async () => {
    const backend = testBackend();
    const served = await serve({
      handle: (_request, response) => { response.writeHead(200).write("the start of a stream that never ends"); },
      port: 0,
      boot: backend.boot,
      grace: 20
    });
    // The stream has started: a request that the server has not yet taken would end with the server, and the grace would cut nothing.
    const started = await fetch(url(served.port));
    const running = started.text().then(() => "answered", () => "cut");

    await served.close();

    expect(await running).toBe("cut");
    expect(backend.done).toEqual(["boot 1", "stop 1", "stopped 1"]);
    // The backend knows when the grace ends: its stop waits until then at most.
    expect(backend.graces.map(grace => [grace.overAtStart, grace.signal.aborted])).toEqual([[false, true]]);
  });

  test("close leaves no timer behind: nothing keeps the process alive once the server stopped", async () => {
    const timers = () => process.getActiveResourcesInfo().filter(resource => resource === "Timeout").length;
    const before = timers();
    const served = await serve({ handle: answer("hello"), port: 0, boot: testBackend().boot });

    await served.close();

    expect(timers()).toBe(before);
  });

  test("close twice closes once, and a reboot after close boots nothing", async () => {
    const backend = testBackend();
    const served = await serve({ handle: answer("hello"), port: 0, boot: backend.boot });

    expect(served.close()).toBe(served.close());
    await served.close();
    await served.reboot();

    expect(backend.done).toEqual(["boot 1", "stop 1", "stopped 1"]);
  });

  test("a port in use: serve fails, and stops the backend that it booted", async () => {
    const first = await serve({ handle: answer("first"), port: 0, boot: testBackend().boot });
    const backend = testBackend();

    await expect(serve({ handle: answer("second"), port: first.port, boot: backend.boot })).rejects.toThrow("EADDRINUSE");

    expect(backend.done).toEqual(["boot 1", "stop 1", "stopped 1"]);
    await first.close();
  });
});

describe("stopOnSignals", () => {
  const setUp = (close: () => Promise<void>) => {
    const signals = new EventEmitter();
    const exits: number[] = [];
    const reported: unknown[] = [];
    stopOnSignals(close, { signals, exit: code => { exits.push(code); }, reportError: error => { reported.push(error); } });
    return { signals, exits, reported };
  };

  test("SIGTERM (docker stop) or SIGINT (Ctrl+C) closes the server, then ends the process with 0", async () => {
    for (const signal of ["SIGTERM", "SIGINT"]) {
      let closed = false;
      const { signals, exits } = setUp(async () => { closed = true; });
      signals.emit(signal);
      await expect.poll(() => exits).toEqual([0]);
      expect(closed).toBe(true);
    }
  });

  test("a close that fails is reported, and the process ends with 1", async () => {
    const failure = new Error("stuck");
    const { signals, exits, reported } = setUp(() => Promise.reject(failure));
    signals.emit("SIGTERM");
    await expect.poll(() => exits).toEqual([1]);
    expect(reported).toEqual([failure]);
  });

  test("a second signal, a second or more after the first, ends the process at once, with 1", () => {
    vi.useFakeTimers();
    try {
      const { signals, exits } = setUp(() => new Promise(() => {}));
      signals.emit("SIGINT");
      vi.advanceTimersByTime(999);
      signals.emit("SIGINT");
      expect(exits).toEqual([]);
      vi.advanceTimersByTime(1);
      signals.emit("SIGINT");
      expect(exits).toEqual([1]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("a signal that comes twice at once counts once: the process group gets it, and npm passes it on to the server", async () => {
    const closing = Promise.withResolvers<void>();
    const { signals, exits } = setUp(() => closing.promise);
    signals.emit("SIGTERM");
    signals.emit("SIGTERM");
    expect(exits).toEqual([]);
    closing.resolve();
    await expect.poll(() => exits).toEqual([0]);
  });

  test("without options: the signals of the process, process.exit, and the console", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const signals = new EventEmitter();
      stopOnSignals(() => Promise.reject(new Error("stuck")), { signals });
      signals.emit("SIGTERM");
      await expect.poll(() => exit.mock.calls).toEqual([[1]]);
      expect(error).toHaveBeenCalledWith(new Error("stuck"));

      const listeners = (signal: NodeJS.Signals) => process.listeners(signal).length;
      const before = [listeners("SIGTERM"), listeners("SIGINT")];
      stopOnSignals(async () => {});
      expect([listeners("SIGTERM"), listeners("SIGINT")]).toEqual([before[0] + 1, before[1] + 1]);
      for (const signal of ["SIGTERM", "SIGINT"] as const) process.removeListener(signal, process.listeners(signal).at(-1)!);
    } finally {
      exit.mockRestore();
      error.mockRestore();
    }
  });
});
