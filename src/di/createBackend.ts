import type { DomainEvent } from "../DomainEvent.js";
import type { Token } from "../Token.js";
import { BackendEventBus, type Published } from "../messaging/BackendEventBus.js";
import { ContextMap, type Envelope, type Translation } from "../messaging/ContextMap.js";
import { EventPublisher } from "../messaging/EventPublisher.js";
import { InProcessMessageBus, UnknownInputError } from "../messaging/InProcessMessageBus.js";
import { MessageBus } from "../messaging/MessageBus.js";
import { ReportError, reportToConsole } from "../messaging/ReportError.js";
import { bind, Container, type Binding, type Concrete } from "./Container.js";
import type { BackendModules, Class, UseCase } from "./discover.js";
import { RequestContext } from "./RequestContext.js";

export type BackendOptions = {
  /** Bindings that replace those of a context, or, under "shared", those of shared for every context. */
  replace?: Partial<Record<string, readonly Binding[]>>;
  reportError?: ReportError;
  nextEventId?: () => string;
};

/** A context, and the events of shared that an event of its handlers gives. */
type Context = { readonly container: Container; readonly useCases: readonly UseCase[]; readonly shares: (event: DomainEvent) => DomainEvent[] };

const SYSTEM: RequestContext = { correlationId: "system" };

/** The context whose events are those of shared: its handlers publish them on the shared bus. */
const SHARED = "shared";

/**
 * Builds every context in a container of its own, child of the container of shared: the dependencies of a context are private to it,
 * those of shared are built once for all. Each request gets a child of its context, with its correlation id, the publisher of its events
 * and its message bus: its handlers and its controllers are built there. The backend event bus is the shared bus: the context map of a
 * context shares there the events of shared that the events of its handlers give, and the context map of each context turns the events
 * of shared that it hears into inputs of the context. The handlers of the context shared publish its events there.
 */
export function createBackend(modules: BackendModules, options: BackendOptions = {}) {
  const reportError = options.reportError ?? reportToConsole;
  const shared = new Container([bind(ReportError).toValue(reportError), ...modules.shared, ...(options.replace?.shared ?? [])]);
  const contexts = new Map<string, Context>();
  const owners = new Map<unknown, Context>();
  const listeners = new Set<(event: DomainEvent) => void>();

  /** The context of an input DTO, or of a controller: the error of an input is that of the message bus, which names the fix. */
  const ownerOf = (owned: Class, refusal: () => Error): Context => {
    const context = owners.get(owned);
    if (!context) throw refusal();
    return context;
  };
  const ownerOfInput = (input: object): Context => ownerOf(input.constructor as Class, () => new UnknownInputError(input.constructor.name));

  /** The container of a request, and its message bus: each input DTO gets a new handler. */
  const requestOf = ({ container, useCases, shares }: Context, request: RequestContext) => {
    const bus = new InProcessMessageBus();
    const scope = container.child([
      bind(RequestContext).toValue(request),
      bind(EventPublisher).toValue({ publish: (event: DomainEvent) => { tell(shares, event, request); } }),
      ...(container.has(MessageBus) ? [] : [bind(MessageBus).toValue(bus)])
    ]);
    for (const { input, handler } of useCases) bus.subscribe(input as never, received => scope.create(handler as Concrete<{ execute(input: unknown): unknown }>).execute(received) as never);
    return { scope, bus };
  };

  const send = async (input: object, request: RequestContext = SYSTEM): Promise<unknown> =>
    requestOf(ownerOfInput(input), request).bus.send(input);

  /**
   * An event that a handler publishes, in its context: the events of shared that the lines of its map that share give go to the shared
   * bus, in the request of the handler. A line that fails is reported: the handler never waits for the other contexts, nor fails for them.
   */
  const tell = (shares: Context["shares"], event: DomainEvent, request: RequestContext) => {
    for (const listener of [...listeners]) listener(event);
    let told: DomainEvent[];
    try {
      told = shares(event);
    } catch (error) {
      reportError(error);
      return;
    }
    for (const sharedEvent of told) eventBus.publish(sharedEvent, request);
  };

  // The lines that hear shared in the context maps, as one: each line gives the inputs of its own context, never those of another.
  const lines = Object.entries(modules.contexts).flatMap(([name, { map }]) => map.flatMap((line): Translation[] => line.shares ? [] : [{
    shares: false,
    event: line.event,
    inputs: (event: never, envelope: Envelope) => {
      const inputs = line.inputs(event, envelope);
      const foreign = inputs.find(input => ownerOfInput(input) !== contexts.get(name));
      if (foreign) throw new Error(`the context map of ${name} gives ${foreign.constructor.name}, an input of another context: a context map gives the inputs of its own context`);
      return inputs;
    }
  }]));
  const eventBus = new BackendEventBus({
    map: new ContextMap(lines),
    send: (input, envelope) => send(input, { correlationId: envelope.correlationId }),
    nextEventId: options.nextEventId ?? (() => crypto.randomUUID()),
    reportError
  });

  for (const [name, { bindings, useCases, controllers, map }] of Object.entries(modules.contexts)) {
    const contextMap = new ContextMap(map);
    const shares = name === SHARED ? (event: DomainEvent) => [event] : (event: DomainEvent) => contextMap.eventsFor(event);
    const context = { container: shared.child([...bindings, ...(options.replace?.[name] ?? [])]), useCases, shares };
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
    send,
    /** The controller of a context, built for a request. */
    controller: <C>(controller: abstract new (...args: never[]) => C, request: RequestContext = SYSTEM): C =>
      requestOf(ownerOf(controller, () => new Error(`No context has the controller ${controller.name}: write it in the folder of its use case, as <use-case>.<name>.controller.ts`)), request)
        .scope.create(controller as unknown as Concrete<C>),
    /** Publishes an event of shared on the shared bus. */
    publish: (event: DomainEvent, request: RequestContext = SYSTEM) => { eventBus.publish(event, request); },
    redeliver: (published: Published) => { eventBus.redeliver(published.event, published.envelope); },
    /** Watches every event on the shared bus, in its envelope. */
    subscribe: (listener: (published: Published) => void) => eventBus.subscribe(listener),
    /** Watches every event that the handlers publish in their context, before their context map shares it. */
    subscribeToContexts: (listener: (event: DomainEvent) => void): (() => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    settled: () => eventBus.settled(),
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
