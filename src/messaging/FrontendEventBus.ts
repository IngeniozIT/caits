import type { EventPublisher } from "./EventPublisher.js";
import type { EventSubscriber } from "./EventSubscriber.js";
import { reportToConsole, type ReportError } from "./ReportError.js";

/**
 * The event bus of a frontend context. Delivers each event to every subscriber. An event published during a delivery waits for its turn:
 * every subscriber receives the events in the order they were published. Only the kernel builds it: the others get it as an
 * EventPublisher or as an EventSubscriber.
 */
export class FrontendEventBus<E> implements EventPublisher<E>, EventSubscriber<E> {
  private listeners = new Set<(event: E) => void>();
  private waiting: E[] = [];
  private delivering = false;

  constructor(private reportError: ReportError = reportToConsole) {}

  publish(event: E): void {
    this.waiting.push(event);
    if (this.delivering) return;
    this.delivering = true;
    try {
      while (this.waiting.length > 0) this.deliver(this.waiting.shift() as E);
    } finally {
      this.delivering = false;
    }
  }

  subscribe(listener: (event: E) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private deliver(event: E): void {
    for (const listener of [...this.listeners]) {
      try { listener(event); } catch (error) { this.reportError(error); }
    }
  }
}
