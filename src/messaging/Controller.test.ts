import { describe, expect, test, vi } from "vitest";
import { Controller, InvalidInputError, MalformedBodyError, problem, readBody } from "./Controller.js";
import { Input } from "./Input.js";
import type { MessageBus } from "./MessageBus.js";

class Double extends Input<number> {
  constructor(readonly value: number) { super(); }
}

class DoublingController extends Controller<Double, number> {
  protected async toDto(request: Request): Promise<Double> {
    const text = await request.clone().text();
    const value = Number(text);
    if (Number.isNaN(value)) throw new InvalidInputError("not a number", { text });
    return new Double(value);
  }

  protected async toResponse(output: number, request: Request): Promise<Response> {
    return new Response(`${await request.text()} doubled is ${output}`);
  }

  protected override toErrorResponse(error: unknown, request: Request): Response | Promise<Response> {
    if (error instanceof InvalidInputError) return new Response(`refused: ${error.message} ${JSON.stringify(error.details)}`, { status: 422 });
    if (error instanceof RangeError) return new Response(`out of range: ${error.message}`, { status: 400 });
    return super.toErrorResponse(error, request);
  }
}

const ask = (text: string) => new Request("http://localhost/", { method: "POST", body: text });

function busDoing(execute: (dto: Double) => Promise<number>) {
  const received: Double[] = [];
  const reported: unknown[] = [];
  const bus: MessageBus = { send: <Output>(dto: Input<Output>) => { received.push(dto as Double); return execute(dto as Double) as Promise<Output>; } };
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

  test("a request that cannot become a DTO is refused before the bus, and the controller says what that means", async () => {
    const { received, controller } = busDoing(() => Promise.reject(new Error("never called")));
    const response = await controller.handle(ask("abc"));
    expect(response.status).toBe(422);
    expect(await response.text()).toBe('refused: not a number {"text":"abc"}');
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

  test("a body that is not JSON is a 400 problem, and a body that toDto refuses is a 422 problem with its issues", async () => {
    class Reading extends Controller<Double, number> {
      protected async toDto(request: Request): Promise<Double> {
        const body = await readBody(request);
        if (typeof body !== "number") throw new InvalidInputError("Invalid body", [{ message: "Expected a number" }]);
        return new Double(body);
      }
      protected toResponse(output: number): Response { return new Response(String(output)); }
    }
    const controller = new Reading({ send: () => Promise.reject(new Error("never called")) });

    const malformed = await controller.handle(ask("{not json"));
    expect(malformed.status).toBe(400);
    expect(malformed.headers.get("content-type")).toBe("application/problem+json");
    expect(await malformed.json()).toEqual({ type: "urn:caits:problem:invalid-request-body", title: "Invalid request body", status: 400, detail: "Invalid JSON" });

    const refused = await controller.handle(ask('"abc"'));
    expect(refused.status).toBe(422);
    expect(refused.headers.get("content-type")).toBe("application/problem+json");
    expect(await refused.json()).toEqual({ type: "urn:caits:problem:invalid-request-body", title: "Invalid request body", status: 422, detail: "Invalid body", issues: [{ message: "Expected a number" }] });
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

  test("a refused request is a named error that carries what was wrong", () => {
    const error = new InvalidInputError("not a number", { input: "abc" });
    expect(error).toMatchObject({ name: "InvalidInputError", message: "not a number", details: { input: "abc" } });
    expect(error).toBeInstanceOf(Error);
  });

  describe("reading the body", () => {
    const post = (body: BodyInit, contentType?: string) => new Request("http://localhost/", { method: "POST", body, ...(contentType ? { headers: { "content-type": contentType } } : {}) });

    test("reads the JSON of the body", async () => {
      expect(await readBody(post(JSON.stringify({ text: "à relire" }), "application/json"))).toEqual({ text: "à relire" });
    });

    test("reads JSON whatever the request says its content is, as a client that forgot to say", async () => {
      expect(await readBody(post('{"a":1}'))).toEqual({ a: 1 });
      expect(await readBody(post("null"))).toBeNull();
    });

    test("leaves the request readable", async () => {
      const request = post(JSON.stringify({ a: 1 }), "application/json");
      await readBody(request);
      expect(await request.json()).toEqual({ a: 1 });
    });

    test("refuses a body that is not JSON, with an error that says so", async () => {
      const attempt = readBody(post("{not json"));
      await expect(attempt).rejects.toBeInstanceOf(MalformedBodyError);
      await expect(attempt).rejects.toBeInstanceOf(InvalidInputError);
      await expect(attempt).rejects.toThrow("Invalid JSON");
      await expect(readBody(new Request("http://localhost/", { method: "POST" }))).rejects.toThrow("Invalid JSON");
      await expect(readBody(post(new URLSearchParams({ a: "1" })))).rejects.toThrow("Invalid JSON");
    });
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
