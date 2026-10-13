import { test as base } from "vitest";
import { createTestBackendApplication, type TestBackendApplication } from "./applications.js";

/**
 * Everything a test of the context map imports. `test` checks what the `ContextMap` gives: the input DTOs for an event of shared
 * (`inputsFor`), the events of shared for an event of the context (`eventsFor`).
 */
export { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
export { ContextMap } from "../../messaging/ContextMap.js";
export type { TestBackendApplication } from "./applications.js";

/** A test of a flow, with `app`: it connects the contexts with the context map, and uses the Fakes of the test.di.ts files. */
export const backendTest = base.extend<{ app: TestBackendApplication }>({
  app: async ({}, use) => { await use(createTestBackendApplication()); }
});
