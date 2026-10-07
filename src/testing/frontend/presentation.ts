/**
 * Everything a presentation test of the frontend imports: the test of a View. The file starts with `// @vitest-environment happy-dom`.
 * `testPresentation` gives the real EventBus and Store of a context, with a Fake MessageBus that records the DTOs in `sent`.
 */
export { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
export { globalWith, testPresentation } from "./frontends.js";
export { mountTemplate, press, settle } from "./marko.js";
