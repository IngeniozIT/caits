import { expect } from "vitest";
import type { TimerController } from "../../messaging/TimerController.js";
import type { startPresentationApplication } from "./presentationApplication.js";

type PresentationApplication = ReturnType<typeof startPresentationApplication>;

/** The body of a request, and its type: a form, a text as it is, or JSON. */
function bodyOf(body: unknown): RequestInit {
  if (body === undefined) return {};
  // A form, which fetch sends with its type: multipart/form-data for a FormData, application/x-www-form-urlencoded for URLSearchParams.
  if (body instanceof FormData || body instanceof URLSearchParams) return { body };
  return { body: typeof body === "string" ? body : JSON.stringify(body), headers: { "content-type": "application/json" } };
}

export class PresentationScenario {
  private request: Request | undefined;
  /** The client of the request: it leaves when the test has read the start of a stream. */
  private readonly client = new AbortController();
  private timer: (abstract new (...args: never[]) => TimerController<object>) | undefined;

  constructor(private readonly app: PresentationApplication) {}

  /**
   * A request with a body sends it as JSON: a string is the text of the body as it is (`"{not json"`), any other value its JSON. A
   * FormData is sent as a form, multipart/form-data, with its files, and URLSearchParams as a form of URL encoding.
   */
  givenTheRequest(method: string, path: string, body?: unknown): this {
    this.request = new Request(`http://localhost${path}`, { method, signal: this.client.signal, ...bodyOf(body) });
    return this;
  }

  /** The timer controller whose turn the test runs, instead of a request. */
  givenTheTimer(timer: abstract new (...args: never[]) => TimerController<object>): this {
    this.timer = timer;
    return this;
  }

  expectItToSend(message: object): this {
    this.app.messageBus.expect(message);
    return this;
  }

  givenTheApplicationReplies(output: unknown): this {
    this.app.messageBus.replyToTheLast(output);
    return this;
  }

  /** The events that the application publishes when it receives the last message, before it answers: a stream writes them. */
  givenTheApplicationPublishes(...events: object[]): this {
    this.app.messageBus.publishTheLast(events);
    return this;
  }

  /** The application never answers the last message: its handler keeps running, while a stream writes what it published. */
  givenTheApplicationKeepsRunning(): this {
    this.app.messageBus.keepTheLastRunning();
    return this;
  }

  givenTheApplicationFails(error: Error): this {
    this.app.messageBus.failTheLast(error);
    return this;
  }

  /** Runs one turn of the timer: it runs every `every` milliseconds, sends what the test expects, and reports no error. */
  async expectTheTurnToRunEvery(every: number): Promise<void> {
    if (this.timer === undefined) throw new Error("PresentationScenario: call givenTheTimer(...) before expectTheTurnToRunEvery(...).");
    expect(await this.app.tick(this.timer)).toBe(every);
    expect(this.app.reportedErrors).toEqual([]);
    this.app.messageBus.verify();
  }

  /** Reads the whole stream of the response: its status, its headers (null for a header that it does not have), and its text. */
  async expectTheStreamToBe(status: number, text: string, headers: Record<string, string | null> = {}): Promise<void> {
    const response = await this.stream(status, headers);
    expect(await response.text()).toBe(text);
    this.app.messageBus.verify();
  }

  /**
   * Reads the start of the stream of the response, as long as the text, then the client leaves: the test of a feed, or of a client that
   * leaves. The signal that went with each DTO aborts then: the handler sees the client leave.
   */
  async expectTheStreamToStartWith(status: number, text: string, headers: Record<string, string | null> = {}): Promise<void> {
    const reader = (await this.stream(status, headers)).body!.getReader();
    const decoder = new TextDecoder();
    let read = "";
    while (read.length < text.length) {
      const chunk = await reader.read();
      if (chunk.done) break;
      read += decoder.decode(chunk.value, { stream: true });
    }
    expect(read.slice(0, text.length)).toBe(text);
    this.client.abort();
    await reader.cancel();
    await new Promise(resolve => { setTimeout(resolve, 0); });
    this.app.messageBus.verify();
    this.app.messageBus.verifyLeft();
  }

  private async stream(status: number, headers: Record<string, string | null>): Promise<Response> {
    if (this.request === undefined) throw new Error("PresentationScenario: call givenTheRequest(...) before reading its stream.");
    const response = await this.app.fetch(this.request);
    expect(response.status).toBe(status);
    for (const [name, value] of Object.entries(headers)) expect(response.headers.get(name), `header ${name}`).toBe(value);
    return response;
  }

  /** Reads the response: its status, its body, and its headers, null for a header that it does not have. */
  async expectTheResponseToBe(status: number, body?: unknown, headers: Record<string, string | null> = {}): Promise<void> {
    if (this.request === undefined) throw new Error("PresentationScenario: call givenTheRequest(...) before expectTheResponseToBe(...).");
    const response = await this.app.fetch(this.request);

    expect(response.status).toBe(status);
    for (const [name, value] of Object.entries(headers)) expect(response.headers.get(name), `header ${name}`).toBe(value);
    if (body === undefined) expect(await response.text()).toBe("");
    else expect(await response.json()).toEqual(body);
    this.app.messageBus.verify();
  }
}

export const presentationScenario = (app: PresentationApplication): PresentationScenario => new PresentationScenario(app);
