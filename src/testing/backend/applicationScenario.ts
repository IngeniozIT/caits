import { expect } from "vitest";
import type { DomainEvent } from "../../DomainEvent.js";
import type { Input } from "../../messaging/Input.js";
import type { TestApplication } from "./applications.js";

type Result<Output> = { output: Output } | { error: unknown };

/**
 * An application test, written as a presentation test: the input DTO, the events the handler publishes, then the output DTO or the error
 * that the message bus gives. The events are checked only when the test says which ones it expects.
 */
export class ApplicationScenario<Output> {
  private readonly expected: DomainEvent[] = [];
  private checksEvents = false;

  constructor(private readonly app: TestApplication, private readonly dto: Input<Output>) {}

  expectItToPublish(event: DomainEvent): this {
    this.expected.push(event);
    this.checksEvents = true;
    return this;
  }

  expectItToPublishNothing(): this {
    this.checksEvents = true;
    return this;
  }

  async expectTheOutputToBe(output: Output): Promise<void> {
    const from = this.app.published.length;
    const result = await this.run();
    if ("error" in result) throw result.error;
    this.checkTheEventsFrom(from);
    expect(result.output).toStrictEqual(output);
  }

  async expectTheErrorToBe(error: Error): Promise<void> {
    const from = this.app.published.length;
    const result = await this.run();
    if (!("error" in result)) throw new Error(`The message bus gave an output instead of an error: ${JSON.stringify(result.output)}`);
    this.checkTheEventsFrom(from);
    expect(result.error).toStrictEqual(error);
  }

  private async run(): Promise<Result<Output>> {
    try {
      return { output: await this.app.send(this.dto) };
    } catch (error) {
      return { error };
    }
  }

  private checkTheEventsFrom(from: number): void {
    if (this.checksEvents) expect(this.app.published.slice(from), "the published events").toStrictEqual(this.expected);
  }
}

export const applicationScenario = (app: TestApplication) => ({
  givenTheDto: <Output>(dto: Input<Output>) => new ApplicationScenario(app, dto)
});
