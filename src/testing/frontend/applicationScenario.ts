import { expect } from "vitest";
import type { Input } from "../../messaging/Input.js";
import type { TestApplication } from "./applications.js";

/**
 * An application test, written as in the backend: the input DTO, then the events that the handler must publish, one by one. Each of
 * them must be among the events that the handler published, in any order: the handler can publish other events too. A handler of the
 * frontend gives no output, thus the scenario runs when the test awaits it.
 */
export class ApplicationScenario implements PromiseLike<void> {
  private readonly expected: object[] = [];

  constructor(private readonly app: TestApplication, private readonly dto: Input<void>) {}

  expectItToPublish(event: object): this {
    this.expected.push(event);
    return this;
  }

  then<Fulfilled = void, Rejected = never>(
    onFulfilled?: ((value: void) => Fulfilled | PromiseLike<Fulfilled>) | null,
    onRejected?: ((reason: unknown) => Rejected | PromiseLike<Rejected>) | null
  ): Promise<Fulfilled | Rejected> {
    return this.run().then(onFulfilled, onRejected);
  }

  private async run(): Promise<void> {
    const from = this.app.published.length;
    await this.app.execute(this.dto);
    expect(this.app.published.slice(from), "the published events").toEqual(expect.arrayContaining(this.expected));
  }
}

export const applicationScenario = (app: TestApplication) => ({
  givenTheDto: (dto: Input<void>) => new ApplicationScenario(app, dto)
});
