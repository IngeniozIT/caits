/// <reference path="../../virtual-modules.d.ts" />
import { bindings as testDi } from "virtual:kernel/backend-test";
import type { Binding } from "../../di/Container.js";
import { createBackend } from "../../di/createBackend.js";
import { discovered } from "../../di/discovered.js";
import type { DomainEvent } from "../../DomainEvent.js";
import type { Published } from "../../messaging/BackendEventBus.js";

/** The test.di.ts of each context, and of shared: the bindings that replace, in tests, those that reach outside the process. */
const testBindings: Record<string, readonly Binding[]> = Object.fromEntries(
  Object.entries(testDi)
    .map(([path, bindings]) => [/backend\/([^/]+)\//.exec(path)![1], bindings])
);

type EventType<E extends DomainEvent> = abstract new (...args: never[]) => E;

/** The whole backend, built from the bindings of its contexts with their test.di.ts over them, and predictable ids. For the tests of the context map. */
export function createTestBackendApplication() {
  const reportedErrors: unknown[] = [];
  const published: Published[] = [];
  let eventIds = 0;
  const backend = createBackend(discovered, {
    replace: testBindings,
    reportError: error => { reportedErrors.push(error); },
    nextEventId: () => `evt-${++eventIds}`
  });
  backend.subscribe(event => { published.push(event); });

  return {
    ...backend,
    reportedErrors,
    /** Every event the contexts published, in its envelope, in the order they were published. */
    published,
    publishedNames: () => published.map(({ event }) => event.constructor.name),
    publishedOf: <E extends DomainEvent>(type: EventType<E>): E[] => published.flatMap(({ event }) => event instanceof type ? [event] : [])
  };
}

/**
 * Every context, built from its di.ts with its test.di.ts over it, but alone: no event reaches another context. A test sends input DTOs
 * and reads the events the handlers published.
 */
export function createTestApplication() {
  const published: DomainEvent[] = [];
  const backend = createBackend({ ...discovered, map: [] }, { replace: testBindings, reportError: () => undefined });
  backend.subscribe(({ event }) => { published.push(event); });

  return {
    /** Sends an input DTO to the message bus of the context that handles it. */
    send: backend.send,
    /** The dependency with this token, built now if no handler needed it before. */
    get: backend.get,
    /** Gives the dependency that the app uses from now on: a test builds its own Fake, and keeps it to arrange and check it. */
    use: backend.use,
    /** Every event the handlers published, in the order they published them. */
    published,
    publishedOf: <E extends DomainEvent>(type: EventType<E>): E[] => published.flatMap(event => event instanceof type ? [event] : [])
  };
}

export type TestBackendApplication = ReturnType<typeof createTestBackendApplication>;
export type TestApplication = ReturnType<typeof createTestApplication>;
