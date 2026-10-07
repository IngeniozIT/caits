/// <reference path="../../virtual-modules.d.ts" />
import "virtual:marko-run/__marko-run__router.js";
import { fetch } from "@marko/run/router";
import { startBackend } from "../../di/backend.js";
import { bind } from "../../di/Container.js";
import { Dispatcher } from "../../messaging/Controller.js";
import { FakeMessageBus } from "../shared/FakeMessageBus.js";

/** The real routes and controllers, over a bus that only records: each test says what the application answers. */
export function startPresentationApplication() {
  const messageBus = new FakeMessageBus();
  const reportedErrors: unknown[] = [];
  const reportError = (error: unknown) => { reportedErrors.push(error); };
  startBackend({ reportError, replace: { shared: [bind(Dispatcher).toValue(messageBus)] } });

  return {
    messageBus,
    reportedErrors,
    async send(request: Request): Promise<Response> {
      const response = await fetch(request, {} as never);
      if (!response) throw new Error(`No route answers ${request.method} ${new URL(request.url).pathname}`);
      return response;
    }
  };
}
