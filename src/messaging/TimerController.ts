import type { MessageBus } from "./MessageBus.js";
import { reportToConsole, type ReportError } from "./ReportError.js";

/**
 * Sends an input DTO at each turn of a timer: what an HTTP controller does for a request, with time for the trigger. The kernel runs it
 * every `every` milliseconds while the server runs, in a request of its own at each turn, and skips a turn while the last one runs. An
 * error is reported, never thrown: the next turn comes anyway.
 */
export abstract class TimerController<Dto extends object> {
  constructor(private bus: MessageBus, private reportError: ReportError = reportToConsole) {}

  /** How often the kernel runs it, in milliseconds. */
  abstract readonly every: number;

  protected abstract toDto(): Dto | Promise<Dto>;

  /** Sends the DTO of this turn, and waits for its handler. */
  async tick(): Promise<void> {
    try {
      await this.bus.send(await this.toDto());
    } catch (error) {
      this.reportError(error);
    }
  }
}
