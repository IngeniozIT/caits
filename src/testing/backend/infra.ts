/**
 * Everything an infra test of the backend imports: the contract of a port, and the test of each implementation that runs it.
 * `useTempDirectories` gives empty folders to the implementations that write files.
 */
export { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
export { useTempDirectories } from "../shared/tempDirectories.js";
