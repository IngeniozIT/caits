import { test as base } from "vitest";
import { createTestApplication, type TestApplication } from "./applications.js";

/** Everything an application test of the frontend imports: the test of a use case, written as a scenario. */
export { afterAll, afterEach, beforeAll, beforeEach, describe, expect, vi } from "vitest";
export { applicationScenario } from "./applicationScenario.js";
export type { TestApplication } from "./applications.js";

/** A test with `app`: every context, each one alone, built from its di.ts with its test.di.ts over it. */
export const test = base.extend<{ app: TestApplication }>({
  app: async ({}, use) => { await use(createTestApplication()); }
});
