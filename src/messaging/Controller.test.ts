import { describe, expect, test, vi } from "vitest";
import { Controller, InvalidInputError, MAX_BODY_SIZE, problem } from "./Controller.js";
import type { MessageBus } from "./MessageBus.js";
import type { Request } from "./Request.js";

class Double {
  constructor(readonly value: number) {}
}

class DoublingController extends Controller<Double, number> {
  protected async toDto(request: Request): Promise<Double> {
    const value = await request.content();
    if (typeof value !== "number") throw new InvalidInputError("not a number", { value });
    return new Double(value);
  }

  /** The content of the request, read again: the Request of CAITS gives it at each call. */
  protected async toResponse(output: number, request: Request): Promise<Response> {
    return new Response(`${String(await request.content())} doubled is ${output}`);
  }

  protected override toErrorResponse(error: unknown, request: Request): Response | Promise<Response> {
    if (error instanceof InvalidInputError) return new Response(`refused: ${error.message} ${JSON.stringify(error.details)}`, { status: 422 });
    if (error instanceof RangeError) return new Response(`out of range: ${error.message}`, { status: 400 });
    return super.toErrorResponse(error, request);
  }
}

const ask = (text: string) => new globalThis.Request("http://localhost/", { method: "POST", body: text, headers: { "content-type": "application/json" } });

function busDoing(execute: (dto: Double) => Promise<number>) {
  const received: Double[] = [];
  const reported: unknown[] = [];
  const bus: MessageBus = { send: (dto: object) => { received.push(dto as Double); return execute(dto as Double); } };
  return { received, reported, controller: new DoublingController(bus, error => reported.push(error)) };
}

describe("Controller", () => {
  test("gives the bus the DTO made from the request, and turns the output into the response", async () => {
    const { received, controller } = busDoing(dto => Promise.resolve(dto.value * 2));
    const response = await controller.handle(ask("21"));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("21 doubled is 42");
    expect(received).toStrictEqual([new Double(21)]);
  });

  test("gives the bus the signal of its request with the DTO: the handler sees its client leave", async () => {
    const signals: (AbortSignal | undefined)[] = [];
    const controller = new DoublingController({ send: (_dto, sending) => { signals.push(sending?.signal); return Promise.resolve(2); } });
    const client = new AbortController();
    await controller.handle(new globalThis.Request("http://localhost/", { method: "POST", body: "1", headers: { "content-type": "application/json" }, signal: client.signal }));
    expect(signals.map(signal => signal?.aborted)).toEqual([false]);
    client.abort();
    expect(signals.map(signal => signal?.aborted)).toEqual([true]);
  });

  test("a request that cannot become a DTO is refused before the bus, and the controller says what that means", async () => {
    const { received, controller } = busDoing(() => Promise.reject(new Error("never called")));
    const response = await controller.handle(ask('"abc"'));
    expect(response.status).toBe(422);
    expect(await response.text()).toBe('refused: not a number {"value":"abc"}');
    expect(received).toEqual([]);
  });

  test("an error the controller recognises becomes a response", async () => {
    const { controller } = busDoing(() => Promise.reject(new RangeError("too big")));
    const response = await controller.handle(ask("1"));
    expect(response.status).toBe(400);
    expect(await response.text()).toBe("out of range: too big");
  });

  test("an error the controller does not recognise is reported, and answered as an internal server error that tells nothing of it", async () => {
    const { controller, reported } = busDoing(() => Promise.reject(new Error("disk full")));
    const response = await controller.handle(ask("1"));
    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(await response.json()).toEqual({ type: "urn:caits:problem:internal-server-error", title: "Internal server error", status: 500 });
    expect(reported).toEqual([new Error("disk full")]);
  });

  describe("the problems of the body", () => {
    class Reading extends Controller<Double, number> {
      protected async toDto(request: Request): Promise<Double> {
        const body = await request.content();
        if (typeof body !== "number") throw new InvalidInputError("Invalid body", [{ message: "Expected a number" }]);
        return new Double(body);
      }
      protected toResponse(output: number): Response { return new Response(String(output)); }
    }
    const controller = new Reading({ send: () => Promise.reject(new Error("never called")) });

    test("a body that is not JSON is a 400 problem, and a body that toDto refuses is a 422 problem with its issues", async () => {
      const malformed = await controller.handle(ask("{not json"));
      expect(malformed.status).toBe(400);
      expect(malformed.headers.get("content-type")).toBe("application/problem+json");
      expect(await malformed.json()).toEqual({ type: "urn:caits:problem:invalid-request-body", title: "Invalid request body", status: 400, detail: "Invalid JSON" });

      const refused = await controller.handle(ask('"abc"'));
      expect(refused.status).toBe(422);
      expect(refused.headers.get("content-type")).toBe("application/problem+json");
      expect(await refused.json()).toEqual({ type: "urn:caits:problem:invalid-request-body", title: "Invalid request body", status: 422, detail: "Invalid body", issues: [{ message: "Expected a number" }] });
    });

    test("a body that does not say it is JSON or a form is a 415 problem", async () => {
      const response = await controller.handle(new globalThis.Request("http://localhost/", { method: "POST", body: "21" }));

      expect(response.status).toBe(415);
      expect(response.headers.get("content-type")).toBe("application/problem+json");
      expect(await response.json()).toEqual({ type: "urn:caits:problem:unsupported-media-type", title: "Unsupported media type", status: 415, detail: "The content type must be application/json, multipart/form-data or application/x-www-form-urlencoded" });
    });

    test("a body larger than 1 MB is a 413 problem", async () => {
      const response = await controller.handle(ask(" ".repeat(MAX_BODY_SIZE) + "1"));

      expect(response.status).toBe(413);
      expect(response.headers.get("content-type")).toBe("application/problem+json");
      expect(await response.json()).toEqual({ type: "urn:caits:problem:request-body-too-large", title: "Request body too large", status: 413, detail: "The body is larger than 1048576 bytes" });
    });

    test("a form that a browser sends from another site is a 403 problem", async () => {
      class FormReading extends Controller<Double, number> {
        protected async toDto(request: Request): Promise<Double> {
          return new Double(Number((await request.content() as { value: string }).value));
        }
        protected toResponse(output: number): Response { return new Response(String(output)); }
      }
      const form = new URLSearchParams({ value: "21" });
      const response = await new FormReading({ send: () => Promise.reject(new Error("never called")) }).handle(new globalThis.Request("http://localhost/", { method: "POST", body: form, headers: { "sec-fetch-site": "cross-site" } }));

      expect(response.status).toBe(403);
      expect(response.headers.get("content-type")).toBe("application/problem+json");
      expect(await response.json()).toEqual({ type: "urn:caits:problem:cross-site-request", title: "Cross-site request", status: 403, detail: "A browser sent this form from another site" });
    });
  });

  test("a controller that answers an error itself can report it, as CAITS reports the errors that it does not know", async () => {
    class ReportingController extends DoublingController {
      protected override toErrorResponse(error: unknown): Response {
        this.reportError(error);
        return new Response(null, { status: 502 });
      }
    }
    const reported: unknown[] = [];
    const response = await new ReportingController({ send: () => Promise.reject(new Error("upstream")) }, error => reported.push(error)).handle(ask("1"));
    expect([response.status, reported]).toEqual([502, [new Error("upstream")]]);
  });

  test("an error is reported to the console unless the controller is told where", async () => {
    const written: unknown[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((error: unknown) => { written.push(error); });
    try {
      class Plain extends Controller<Double, number> {
        protected toDto(): Double { return new Double(1); }
        protected toResponse(output: number): Response { return new Response(String(output)); }
      }
      expect((await new Plain({ send: () => Promise.reject(new Error("disk full")) }).handle(ask("1"))).status).toBe(500);
    } finally { spy.mockRestore(); }
    expect(written).toEqual([new Error("disk full")]);
  });

  test("a problem is an RFC 9457 response: type, title, status, and a detail when there is one", async () => {
    const response = problem(404, "not-found", "Not found", "Nothing here.", { issues: [1] });
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(await response.json()).toEqual({ type: "urn:caits:problem:not-found", title: "Not found", status: 404, detail: "Nothing here.", issues: [1] });
    expect(await problem(500, "x", "X").json()).toEqual({ type: "urn:caits:problem:x", title: "X", status: 500 });
  });

  test("a failure while building the response is not mistaken for a failure of the application: it is reported and answered as an internal error", async () => {
    const asked: unknown[] = [];
    const reported: unknown[] = [];
    class Clumsy extends Controller<Double, number> {
      protected toDto(): Double { return new Double(1); }
      protected toResponse(): Response { throw new RangeError("could not write the response"); }
      protected override toErrorResponse(error: unknown): Response { asked.push(error); return new Response("handled", { status: 400 }); }
    }
    const response = await new Clumsy({ send: () => Promise.resolve(2 as never) }, error => reported.push(error)).handle(ask("1"));
    expect(response.status).toBe(500);
    expect(asked).toEqual([]);
    expect(reported).toEqual([new RangeError("could not write the response")]);
  });

  test("a failure while explaining an error is reported and answered too: a controller never throws", async () => {
    const reported: unknown[] = [];
    class Clumsy extends Controller<Double, number> {
      protected toDto(): Double { return new Double(1); }
      protected toResponse(): Response { return new Response(); }
      protected override toErrorResponse(): Response { throw new TypeError("could not explain"); }
    }
    const response = await new Clumsy({ send: () => Promise.reject(new Error("disk full")) }, error => reported.push(error)).handle(ask("1"));
    expect(response.status).toBe(500);
    expect(reported).toEqual([new TypeError("could not explain")]);
  });
});
