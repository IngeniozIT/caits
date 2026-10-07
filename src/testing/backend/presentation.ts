import { test as base } from "vitest";
import { startPresentationApplication } from "./presentationApplication.js";

/** Everything a presentation test of the backend imports: the test of a Controller, through its route. */
export { afterAll, afterEach, beforeAll, beforeEach, describe, expect, vi } from "vitest";
export { presentationScenario } from "./presentationScenario.js";

/**
 * A test with `app`: the real routes and Controllers, over a Fake MessageBus. `presentationScenario(app)` sends the Request, checks the
 * Input DTO, gives the reply, and checks the Response.
 */
export const test = base.extend<{ app: ReturnType<typeof startPresentationApplication> }>({
  app: async ({}, use) => { await use(startPresentationApplication()); }
});
