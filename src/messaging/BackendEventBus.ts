import type { DomainEvent } from "../DomainEvent.js";
import type { ContextMap, Envelope } from "./ContextMap.js";
import type { ReportError } from "./ReportError.js";

export type Published = { readonly event: DomainEvent; readonly envelope: Envelope };

const nextTurn = () => new Promise(resolve => { setTimeout(resolve, 0); });

/**
 * The shared bus: carries the events of shared that the context maps share. The context map of each context turns the events of shared
 * that it hears into input DTOs of the context, and each input goes to it. The publisher never waits for the reactions; every failure is
 * reported.
 */
export class BackendEventBus {
  private inFlight = new Set<Promise<void>>();
  private listeners = new Set<(published: Published) => void>();

  constructor(private readonly options: {
    map: ContextMap;
    send: (input: object, envelope: Envelope) => Promise<unknown>;
    nextEventId: () => string;
    reportError: ReportError;
  }) {}

  publish(event: DomainEvent, request: { readonly correlationId: string }): void {
    this.redeliver(event, { eventId: this.options.nextEventId(), correlationId: request.correlationId });
  }

  /** Carries an event again, in the envelope it was first published in: what a broker does when it delivers twice. */
  redeliver(event: DomainEvent, envelope: Envelope): void {
    for (const listener of [...this.listeners]) listener({ event, envelope });
    const delivery = this.deliver(event, envelope);
    this.inFlight.add(delivery);
    void delivery.then(() => { this.inFlight.delete(delivery); });
  }

  /** Watches every event on the shared bus. */
  subscribe(listener: (published: Published) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Waits until every event published so far, and every event they led to, has been carried. */
  async settled(): Promise<void> {
    while (this.inFlight.size > 0) await Promise.all([...this.inFlight]);
  }

  private async deliver(event: DomainEvent, envelope: Envelope): Promise<void> {
    await nextTurn();
    let inputs: object[];
    try {
      inputs = this.options.map.inputsFor(event, envelope);
    } catch (error) {
      this.options.reportError(error);
      return;
    }
    const results = await Promise.allSettled(inputs.map(input => this.options.send(input, envelope)));
    for (const result of results) if (result.status === "rejected") this.options.reportError(result.reason);
  }
}
