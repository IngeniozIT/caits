/// <reference path="../../virtual-modules.d.ts" />
import { bindings as testDi } from "virtual:kernel/frontend-test";
import type { Binding } from "../../di/Container.js";
import { createFrontendWithBus } from "../../di/createFrontend.js";
import { discoveredFrontends } from "../../di/discoveredFrontends.js";
import type { Fetcher } from "../../di/Fetcher.js";
import { UnknownInputError } from "../../messaging/InProcessMessageBus.js";
import type { Token } from "../../Token.js";

/** The test.di.ts of each context that has one: the bindings that replace, in tests, those that reach outside the browser. */
const testBindings: Record<string, readonly Binding[] | undefined> = Object.fromEntries(
  Object.entries(testDi)
    .map(([path, bindings]) => [/frontend\/([^/]+)\//.exec(path)![1], bindings])
);

const offline: Fetcher = input => Promise.reject(new Error(`A test frontend has no network: replace the dependency that asked for ${input}`));

type TestFrontend = ReturnType<typeof createFrontendWithBus>;

/**
 * Every context, built from its di.ts with its test.di.ts over it, each one alone, and only when a test needs it. A test sends input
 * DTOs, as the stores do, and reads the events that the handlers published.
 */
export function createTestApplication() {
  const published: object[] = [];
  const built = new Map<string, TestFrontend>();

  const frontend = (name: string): TestFrontend => {
    let found = built.get(name);
    if (!found) {
      found = createFrontendWithBus(discoveredFrontends[name], offline, testBindings[name]);
      found.events.subscribe(event => { published.push(event as object); });
      built.set(name, found);
    }
    return found;
  };

  const ownerOf = (input: object): string => {
    const name = Object.keys(discoveredFrontends).find(context => discoveredFrontends[context].useCases.some(({ input: type }) => type === input.constructor));
    if (name === undefined) throw new UnknownInputError(input.constructor.name);
    return name;
  };

  /** The contexts that bind this token. */
  const holders = (token: Token<unknown>): string[] => {
    const found = Object.keys(discoveredFrontends).filter(name => [...discoveredFrontends[name].bindings, ...testBindings[name] ?? []].some(binding => binding.key === token));
    if (found.length === 0) throw new Error(`No context binds ${token.name}`);
    return found;
  };

  return {
    /** Sends an input DTO to the message bus of the context that handles it. */
    send: (input: object): Promise<unknown> => frontend(ownerOf(input)).bus.send(input),
    /** The dependency with this token, built now if no handler needed it before. */
    get: <T>(token: Token<T>): T => {
      const found = holders(token);
      if (found.length > 1) throw new Error(`The contexts ${found.join(", ")} each build their own ${token.name}`);
      return frontend(found[0]).get(token);
    },
    /** Gives the dependency that the app uses from now on: a test builds its own Fake, and keeps it to arrange and check it. */
    use: <T, Given extends T>(token: Token<T>, value: Given): Given => {
      for (const name of holders(token)) frontend(name).use(token, value);
      return value;
    },
    /** Every event the handlers published, in the order they published them. */
    published
  };
}

export type TestApplication = ReturnType<typeof createTestApplication>;
