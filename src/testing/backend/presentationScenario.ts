import { expect } from "vitest";
import type { startPresentationApplication } from "./presentationApplication.js";

type PresentationApplication = ReturnType<typeof startPresentationApplication>;

export class PresentationScenario {
  private request: Request | undefined;

  constructor(private readonly app: PresentationApplication) {}

  givenTheRequest(method: string, path: string, body?: unknown): this {
    this.request = new Request(`http://localhost${path}`, {
      method,
      ...(body === undefined ? {} : typeof body === "string" ? { body } : { body: JSON.stringify(body), headers: { "content-type": "application/json" } })
    });
    return this;
  }

  expectItToEmit(message: object): this {
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
    const response = await this.app.send(this.request);

    expect(response.status).toBe(status);
    for (const [name, value] of Object.entries(headers)) expect(response.headers.get(name), `header ${name}`).toBe(value);
    if (body === undefined) expect(await response.text()).toBe("");
    else expect(await response.json()).toEqual(body);
    this.app.messageBus.verify();
  }
}

export const presentationScenario = (app: PresentationApplication): PresentationScenario => new PresentationScenario(app);
