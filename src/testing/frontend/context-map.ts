/**
 * Everything a test of the context map of a frontend context imports: `eventsFor` gives the events of the context that an event of the
 * context shared gives, and the events of shared that an event of the context gives.
 */
export { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
export { eventsFor } from "../../messaging/FrontendContextMap.js";
