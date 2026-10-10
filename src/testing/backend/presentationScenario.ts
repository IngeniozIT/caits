import { expect } from "vitest";
import type { startPresentationApplication } from "./presentationApplication.js";

type PresentationApplication = ReturnType<typeof startPresentationApplication>;

export class PresentationScenario {
  private request: Request | undefined;

  constructor(private readonly app: PresentationApplication) {}

  /** A request with a body sends it as JSON: a string is the text of the body as it is (`"{not json"`), any other value its JSON. */
  givenTheRequest(method: string, path: string, body?: unknown): this {
    this.request = new Request(`http://localhost${path}`, {
      method,
      ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body), headers: { "content-type": "application/json" } })
    });
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

  givenTheApplicationFails(error: Error): this {
    this.app.messageBus.failTheLast(error);
    return this;
  }

  async expectTheResponseToBe(status: number, body?: unknown, headers: Record<string, string> = {}): Promise<void> {
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
