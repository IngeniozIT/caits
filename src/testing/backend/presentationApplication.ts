/// <reference path="../../virtual-modules.d.ts" />
import "virtual:marko-run/__marko-run__router.js";
import { fetch } from "@marko/run/router";
import { controller, startBackend } from "../../di/backend.js";
import { bind } from "../../di/Container.js";
import type { DomainEvent } from "../../DomainEvent.js";
import { ContextEvents } from "../../messaging/ContextEvents.js";
import { MessageBus } from "../../messaging/MessageBus.js";
import { RequestEvents } from "../../messaging/RequestEvents.js";
import type { TimerController } from "../../messaging/TimerController.js";
import { FakeMessageBus } from "../shared/FakeMessageBus.js";

/** The real routes and controllers, over a bus that only records: each test says what the application answers. */
export function startPresentationApplication() {
  // The events that the application publishes, as the test says: the controllers that stream hear them, of their request and of their context.
  const listeners = new Set<(event: DomainEvent) => void>();
  // They never end: a feed ends when the client of the test leaves.
  const events: ContextEvents = {
    subscribe: listener => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    signal: new AbortController().signal
  };
  const messageBus = new FakeMessageBus(event => { for (const listener of [...listeners]) listener(event); });
  const reportedErrors: unknown[] = [];
  const reportError = (error: unknown) => { reportedErrors.push(error); };
  startBackend({ reportError, replace: { shared: [bind(MessageBus).toValue(messageBus), bind(RequestEvents).toValue(events), bind(ContextEvents).toValue(events)] } });

  return {
    messageBus,
    reportedErrors,
    /** Runs one turn of a timer controller, as the kernel does while the server runs, in a request of its own. Gives its rhythm. */
    async tick(timer: abstract new (...args: never[]) => TimerController<object>): Promise<number> {
      const turn = controller(timer);
      await turn.tick();
      return turn.every;
    },
    async fetch(request: Request): Promise<Response> {
      const response = await fetch(request, {} as never);
      if (!response) throw new Error(`No route answers ${request.method} ${new URL(request.url).pathname}`);
      return response;
    }
  };
}
