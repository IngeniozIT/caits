type Outcome = { reply: unknown } | { error: Error };
type Expectation = { message: object; outcome: Outcome | undefined; received: boolean };

function same(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) return false;
  if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) return false;
  if (left instanceof Date) return left.getTime() === (right as Date).getTime();
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && same((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
}

export class FakeMessageBus {
  private expectations: Expectation[] = [];
  private unexpected: object[] = [];

  expect(message: object): void {
    this.expectations.push({ message, outcome: undefined, received: false });
  }

  replyToTheLast(output: unknown): void {
    this.last("replies").outcome = { reply: output };
  }

  failTheLast(error: Error): void {
    this.last("fails").outcome = { error };
  }

  execute(message: object): Promise<never> {
    const expected = this.expectations.find(candidate => !candidate.received && same(candidate.message, message));
    if (!expected) {
      this.unexpected.push(message);
      const pending = this.expectations.filter(candidate => !candidate.received).map(candidate => JSON.stringify(candidate.message)).join(", ") || "none";
      return Promise.reject(new Error(`The application sent a message nobody expected: ${message.constructor.name} ${JSON.stringify(message)} (still expected: ${pending})`));
    }
    expected.received = true;
    if (!expected.outcome) return Promise.reject(new Error(`Nothing is prepared for the application to be answered: ${message.constructor.name}`));
    return "error" in expected.outcome ? Promise.reject(expected.outcome.error) : Promise.resolve(expected.outcome.reply as never);
  }

  verify(): void {
    const missing = this.expectations.filter(expectation => !expectation.received).map(expectation => expectation.message);
    const problems = [
      ...(this.unexpected.length ? [`messages the application sent although nobody expected them: ${JSON.stringify(this.unexpected)}`] : []),
      ...(missing.length ? [`messages the application was expected to send: ${JSON.stringify(missing)}`] : [])
    ];
    if (problems.length) throw new Error(problems.join("\n"));
  }

  private last(step: string): Expectation {
    const last = this.expectations.at(-1);
    if (!last) throw new Error(`Say which message is expected before saying how the application ${step}.`);
    return last;
  }
}
