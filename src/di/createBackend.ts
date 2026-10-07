import type { DomainEvent } from "../DomainEvent.js";
import type { Token } from "../Token.js";
import { ContextMap } from "../messaging/ContextMap.js";
import { Dispatcher } from "../messaging/Controller.js";
import { EventPublisher } from "../messaging/EventPublisher.js";
import type { Input } from "../messaging/Input.js";
import { MessageBus } from "../messaging/MessageBus.js";
import { ReportError } from "../messaging/ReportError.js";
import { SharedBus, type Published } from "../messaging/SharedBus.js";
import { bind, Container, type Binding, type Concrete } from "./Container.js";
import type { BackendModules, Class, UseCase } from "./discover.js";
import { RequestContext } from "./RequestContext.js";

export type BackendOptions = {
  /** Bindings that replace those of a context, or, under "shared", those of shared for every context. */
  replace?: Partial<Record<string, readonly Binding[]>>;
  reportError?: ReportError;
  nextEventId?: () => string;
};

type Context = { readonly container: Container; readonly useCases: readonly UseCase[] };

const SYSTEM: RequestContext = { correlationId: "system" };

/**
 * Builds every context in a container of its own, child of the container of shared: the dependencies of a context are private to it,
 * those of shared are built once for all. Each request gets a child of its context, with its correlation id, the publisher of its events
 * and its message bus: its handlers and its controllers are built there. The shared bus carries the events between contexts.
 */
export function createBackend(modules: BackendModules, options: BackendOptions = {}) {
  const reportError = options.reportError ?? ((error: unknown) => { console.error(error); });
  const shared = new Container([bind(ReportError).toValue(reportError), ...modules.shared, ...(options.replace?.shared ?? [])]);
  const contexts = new Map<string, Context>();
  const owners = new Map<unknown, Context>();

  const ownerOf = (owned: Class): Context => {
    const context = owners.get(owned);
    if (!context) throw new Error(`No context owns ${owned.name}`);
    return context;
  };

  /** The container of a request, and its message bus: each input DTO gets a new handler. */
  const requestOf = ({ container, useCases }: Context, request: RequestContext) => {
    const bus = new MessageBus();
    const scope = container.child([
      bind(RequestContext).toValue(request),
      bind(EventPublisher).toValue({ publish: (event: DomainEvent) => { sharedBus.publish(event, request); } }),
      ...(container.has(Dispatcher) ? [] : [bind(Dispatcher).toValue(bus)])
    ]);
    for (const { input, handler } of useCases) bus.subscribe(input as never, received => scope.create(handler as Concrete<{ execute(input: unknown): unknown }>).execute(received) as never);
    return { scope, bus };
  };

  const execute = async <Output>(input: Input<Output>, request: RequestContext = SYSTEM): Promise<Output> =>
    requestOf(ownerOf(input.constructor as Class), request).bus.execute(input);

  const sharedBus = new SharedBus({
    map: new ContextMap(modules.map),
    deliver: (input, envelope) => execute(input, { correlationId: envelope.correlationId }),
    nextEventId: options.nextEventId ?? (() => crypto.randomUUID()),
    reportError
  });

  for (const [name, { bindings, useCases, controllers }] of Object.entries(modules.contexts)) {
    const context = { container: shared.child([...bindings, ...(options.replace?.[name] ?? [])]), useCases };
    for (const { input } of useCases) owners.set(input, context);
    for (const controller of controllers) owners.set(controller, context);
    contexts.set(name, context);
    // A dependency that nothing gives is refused now, not when a request arrives.
    const { scope } = requestOf(context, SYSTEM);
    for (const type of [...useCases.map(({ handler }) => handler), ...controllers]) scope.check(type as Concrete);
  }

  /** The contexts that bind a token that shared does not bind. */
  const binding = (token: Token<unknown>): [string, Container][] => {
    const found = [...contexts].filter(([, { container }]) => container.has(token)).map(([name, { container }]): [string, Container] => [name, container]);
    if (found.length === 0) throw new Error(`No context binds ${token.name}`);
    return found;
  };

  return {
    /** Sends an input DTO to the context that handles it, in a request of its own. */
    execute,
    /** The controller of a context, built for a request. */
    controller: <C>(controller: abstract new (...args: never[]) => C, request: RequestContext = SYSTEM): C =>
      requestOf(ownerOf(controller), request).scope.create(controller as unknown as Concrete<C>),
    publish: (event: DomainEvent, request: RequestContext = SYSTEM) => { sharedBus.publish(event, request); },
    redeliver: (published: Published) => { sharedBus.redeliver(published.event, published.envelope); },
    subscribe: (listener: (published: Published) => void) => sharedBus.subscribe(listener),
    settled: () => sharedBus.settled(),
    /** For the tests: the dependency with this token, built now if nothing needed it before. */
    get: <T>(token: Token<T>): T => {
      if (shared.has(token)) return shared.get(token);
      const found = binding(token);
      if (found.length > 1) throw new Error(`The contexts ${found.map(([name]) => name).join(", ")} each bind ${token.name}`);
      return found[0][1].get(token);
    },
    /** For the tests: the dependency that the contexts use from now on, in place of the one their bindings build. */
    use: <T, Given extends T>(token: Token<T>, value: Given): Given => {
      for (const container of shared.has(token) ? [shared] : binding(token).map(([, container]) => container)) container.use(token, value);
      return value;
    }
  };
}

export type Backend = ReturnType<typeof createBackend>;
