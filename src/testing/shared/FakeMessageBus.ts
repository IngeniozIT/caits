import type { MessageBus, Sending } from "../../messaging/MessageBus.js";

type Outcome = { reply: unknown } | { error: Error } | { pending: true };
/** A message that the test expects: what the application answers, whether it came, what it publishes, and the signal that went with it. */
type Expectation = { message: object; outcome: Outcome | undefined; received: boolean; publishes: readonly object[]; signal?: AbortSignal };

/** A matcher of Vitest, as `expect.any(String)` gives it: a field of an expected message that the test cannot know, an id drawn by chance. */
const isMatcher = (value: object): value is { asymmetricMatch(other: unknown): boolean } => typeof (value as { asymmetricMatch?: unknown }).asymmetricMatch === "function";

function same(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left === "object" && left !== null && isMatcher(left)) return left.asymmetricMatch(right);
  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) return false;
  if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) return false;
  if (left instanceof Date) return left.getTime() === (right as Date).getTime();
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && same((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
}

/** A message bus that only records: a test says which messages it expects, and what the application answers to each one. */
export class FakeMessageBus implements MessageBus {
  private expectations: Expectation[] = [];
  private unexpected: object[] = [];

  /** What the application publishes when it receives a message: a test of a controller that streams gives where the events go. */
  constructor(private readonly publish: (event: object) => void = () => {}) {}

  expect(message: object): void {
    this.expectations.push({ message, outcome: undefined, received: false, publishes: [] });
  }

  /** The events that the application publishes when it receives the last message, before it answers. */
  publishTheLast(events: readonly object[]): void {
    this.last("publishes").publishes = events;
  }

  /** The application never answers the last message: its handler keeps running. */
  keepTheLastRunning(): void {
    this.last("keeps running").outcome = { pending: true };
  }

  replyToTheLast(output: unknown): void {
    this.last("replies").outcome = { reply: output };
  }

  failTheLast(error: Error): void {
    this.last("fails").outcome = { error };
  }

  send(message: object, sending: Sending = {}): Promise<never> {
    const expected = this.expectations.find(candidate => !candidate.received && same(candidate.message, message));
    if (!expected) {
      this.unexpected.push(message);
      const pending = this.expectations.filter(candidate => !candidate.received).map(candidate => JSON.stringify(candidate.message)).join(", ") || "none";
      return Promise.reject(new Error(`The application sent a message nobody expected: ${message.constructor.name} ${JSON.stringify(message)} (still expected: ${pending})`));
    }
    expected.received = true;
    expected.signal = sending.signal;
    for (const event of expected.publishes) this.publish(event);
    if (!expected.outcome) return Promise.reject(new Error(`Nothing is prepared for the application to be answered: ${message.constructor.name}`));
    if ("pending" in expected.outcome) return new Promise(() => {});
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

  /**
   * Once the client left: each message came with the signal of its request, which aborted. Without it, the handler would not see the
   * client leave.
   */
  verifyLeft(): void {
    const problems = this.expectations.filter(({ received }) => received).flatMap(({ message, signal }) => {
      const name = `${message.constructor.name} ${JSON.stringify(message)}`;
      if (!signal) return [`the application sent ${name} without the signal of its request: its handler cannot see the client leave`];
      return signal.aborted ? [] : [`the signal that went with ${name} did not abort when the client left`];
    });
    if (problems.length) throw new Error(problems.join("\n"));
  }

  private last(step: string): Expectation {
    const last = this.expectations.at(-1);
    if (!last) throw new Error(`Say which message is expected before saying how the application ${step}.`);
    return last;
  }
}
