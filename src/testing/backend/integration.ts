import { createBackend } from "../../di/createBackend.js";
import { discovered } from "../../di/discovered.js";

/** Everything an integration test imports: flows of the context map again, with the real infra implementations. */
export { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

/** The whole backend, built from the di.ts of the contexts only: the real infra implementations, as in production. */
export const productionBackend = () => createBackend(discovered);
