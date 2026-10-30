import type { DomainEvent } from "../DomainEvent.js";
import type { Token } from "../Token.js";
import { BackendEventBus, type Published } from "../messaging/BackendEventBus.js";
import { ContextEvents } from "../messaging/ContextEvents.js";
import { ContextMap, type Envelope, type Translation } from "../messaging/ContextMap.js";
import { EventPublisher } from "../messaging/EventPublisher.js";
import { InProcessMessageBus, UnknownInputError } from "../messaging/InProcessMessageBus.js";
import type { EventSubscriber } from "../messaging/EventSubscriber.js";
import { MessageBus } from "../messaging/MessageBus.js";
import { ReportError, reportToConsole } from "../messaging/ReportError.js";
import { RequestEvents } from "../messaging/RequestEvents.js";
import { TimerController } from "../messaging/TimerController.js";
import { bind, Container, type Binding, type Concrete } from "./Container.js";
import type { BackendModules, Class, UseCase } from "./discover.js";
import { RequestContext } from "./RequestContext.js";

export type BackendOptions = {
  /** Bindings that replace those of a context, or, under "shared", those of shared for every context. */
  replace?: Partial<Record<string, readonly Binding[]>>;
  reportError?: ReportError;
  nextEventId?: () => string;
  /** The clock of the timer controllers: setInterval when not given. */
  schedule?: Schedule;
};

/** Runs a turn every `every` milliseconds, until the function that it gives is called. */
export type Schedule = (every: number, turn: () => void) => () => void;

/** The longest delay of setInterval, about 24 days: Node runs a timer with a longer one every millisecond. */
const MAX_EVERY = 2 ** 31 - 1;

/** How long the turns and the reactions that still run get, once the grace ends and their signal aborted, in milliseconds. */
const LAST_WAIT_MS = 1000;

/** Waits until the work ends, or the signal aborts. */
const untilEndOrAbort = (work: Promise<unknown>, signal: AbortSignal) => new Promise<void>(resolve => {
  signal.addEventListener("abort", () => { resolve(); });
  if (signal.aborted) resolve();
  void work.then(() => { resolve(); });
});


const everyInterval: Schedule = (every, turn) => {
  const timer = setInterval(turn, every);
  return () => { clearInterval(timer); };
};

const isTimer = (type: Class): type is Concrete<TimerController<object>> => type.prototype instanceof TimerController;

type Listener = (event: DomainEvent) => void;

/**
 * A context, its timer controllers, the events of shared that an event of its handlers gives, and who listens to the events of its
 * handlers.
 */
type Context = {
  readonly container: Container;
  readonly useCases: readonly UseCase[];
  readonly timers: readonly Concrete<TimerController<object>>[];
  readonly shares: (event: DomainEvent) => DomainEvent[];
  readonly listeners: Set<Listener>;
};

/** What subscribes to the events that come to these listeners. */
const subscriberOf = (listeners: Set<Listener>): EventSubscriber<DomainEvent> => ({
  subscribe: listener => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }
});

/** Where a request of the backend comes from: its correlation id. */
type Correlation = Pick<RequestContext, "correlationId">;

const SYSTEM: Correlation = { correlationId: "system" };

/** The context whose events are those of shared: its handlers publish them on the shared bus. */
const SHARED = "shared";

/**
 * Builds every context in a container of its own, child of the container of shared: the dependencies of a context are private to it,
 * those of shared are built once for all. Each request gets a child of its context, with its correlation id, its signal, the publisher of
 * its events and its message bus: its handlers and its controllers are built there. Its signal aborts when the signal that goes with its
 * DTO aborts: a controller gives the signal of its request, so its handler sees its client leave. The backend event bus is the shared bus: the context map of a
 * context shares there the events of shared that the events of its handlers give, and the context map of each context turns the events
 * of shared that it hears into inputs of the context. The handlers of the context shared publish its events there.
 */
export function createBackend(modules: BackendModules, options: BackendOptions = {}) {
  const reportError = options.reportError ?? reportToConsole;
  const shared = new Container([bind(ReportError).toValue(reportError), ...modules.shared, ...(options.replace?.shared ?? [])]);
  const contexts = new Map<string, Context>();
  const owners = new Map<unknown, Context>();
  const listeners = new Set<Listener>();
  /** Aborts when the backend stops: the events of the contexts end. */
  const stopping = new AbortController();
  /** The requests without a client see the backend stop: the turns of the timers at once, the reactions to the events once the grace ends. */
  const turnsEnd = new AbortController();
  const reactionsEnd = new AbortController();

  /** The context of an input DTO, or of a controller: the error of an input is that of the message bus, which names the fix. */
  const ownerOf = (owned: Class, refusal: () => Error): Context => {
    const context = owners.get(owned);
    if (!context) throw refusal();
    return context;
  };
  const ownerOfInput = (input: object): Context => ownerOf(input.constructor as Class, () => new UnknownInputError(input.constructor.name));

  /**
   * The container of a request, and its message bus: each input DTO gets a new handler. A request without a client follows `ends`: its
   * signal aborts when the backend stops it.
   */
  const requestOf = (context: Context, { correlationId }: Correlation, ends?: AbortSignal) => {
    const { container, useCases } = context;
    const bus = new InProcessMessageBus();
    const left = new AbortController();
    const request: RequestContext = { correlationId, signal: ends === undefined ? left.signal : AbortSignal.any([left.signal, ends]) };
    /** The signal of the request follows the one that goes with a DTO: it aborts with it, or at once if it came aborted. */
    const follow = (signal: AbortSignal | undefined) => {
      if (signal?.aborted) left.abort(signal.reason);
      else signal?.addEventListener("abort", () => { left.abort(signal.reason); });
    };
    // Who listens to the events that the handlers of this request publish: a controller that streams them.
    const heard = new Set<Listener>();
    const scope = container.child([
      bind(RequestContext).toValue(request),
      bind(EventPublisher).toValue({ publish: (event: DomainEvent) => {
        for (const listener of [...heard]) listener(event);
        tell(context, event, request);
      } }),
      ...(container.has(MessageBus) ? [] : [bind(MessageBus).toValue(bus)]),
      ...(container.has(RequestEvents) ? [] : [bind(RequestEvents).toValue(subscriberOf(heard))])
    ]);
    for (const { input, handler } of useCases) {
      bus.subscribe(input as never, (received, { signal }) => {
        follow(signal);
        return scope.create(handler as Concrete<{ execute(input: unknown): unknown }>).execute(received);
      });
    }
    return { scope, bus };
  };

  /** Sends an input DTO in a request of its own: with a correlation id, "system" by default, and the signal of its client, if it has one. */
  const send = async (input: object, { correlationId = SYSTEM.correlationId, signal }: Partial<Correlation> & { readonly signal?: AbortSignal } = {}): Promise<unknown> =>
    requestOf(ownerOfInput(input), { correlationId }).bus.send(input, { signal });

  /** The reactions to the events that run, and the name of their input: the stop reports those that outlive it. */
  const reactions = new Map<Promise<unknown>, string>();
  /** Sends the input that an event gives, in a request of its own, which ends when the backend stops the reactions. */
  const react = (input: object, correlationId: string): Promise<unknown> => {
    const reaction = (async () => requestOf(ownerOfInput(input), { correlationId }, reactionsEnd.signal).bus.send(input))();
    reactions.set(reaction, input.constructor.name);
    const forget = () => { reactions.delete(reaction); };
    void reaction.then(forget, forget);
    return reaction;
  };

  /**
   * An event that a handler publishes, in its context: the events of shared that the lines of its map that share give go to the shared
   * bus, in the request of the handler. A line that fails is reported: the handler never waits for the other contexts, nor fails for them.
   */
  const tell = ({ shares, listeners: contextListeners }: Context, event: DomainEvent, request: Correlation) => {
    for (const listener of [...listeners, ...contextListeners]) listener(event);
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
    send: (input, envelope) => react(input, envelope.correlationId),
    nextEventId: options.nextEventId ?? (() => crypto.randomUUID()),
    reportError
  });

  for (const [name, { bindings, useCases, controllers, map }] of Object.entries(modules.contexts)) {
    const contextMap = new ContextMap(map);
    const shares = name === SHARED ? (event: DomainEvent) => [event] : (event: DomainEvent) => contextMap.eventsFor(event);
    const context = { container: shared.child([...bindings, ...(options.replace?.[name] ?? [])]), useCases, timers: controllers.filter(isTimer), shares, listeners: new Set<Listener>() };
    if (!context.container.has(ContextEvents)) context.container.use(ContextEvents, { ...subscriberOf(context.listeners), signal: stopping.signal });
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

  const schedule = options.schedule ?? everyInterval;
  const cancels: (() => void)[] = [];
  /** The turns that run, and the name of their timer controller. */
  const turns = new Map<Promise<void>, string>();

  /** The rhythm of a timer controller of a context, in milliseconds: one that Node cannot keep is refused. */
  const rhythmOf = (context: Context, timer: Concrete<TimerController<object>>) => {
    const { every } = requestOf(context, SYSTEM).scope.create(timer);
    if (!(every > 0 && every <= MAX_EVERY)) throw new Error(`${timer.name} runs every ${every} ms, but its every is a number of milliseconds above 0, up to ${MAX_EVERY} (24 days): Node runs a longer one every millisecond`);
    return every;
  };

  /** Runs a timer controller of a context every `every` milliseconds, each turn in a request of its own, and never two turns at once. */
  const run = (context: Context, timer: Concrete<TimerController<object>>, every: number) => {
    let running = false;
    cancels.push(schedule(every, () => {
      if (running) return;
      running = true;
      const turn = (async () => {
        try {
          await requestOf(context, { correlationId: crypto.randomUUID() }, turnsEnd.signal).scope.create(timer).tick();
        } catch (error) {
          reportError(error);
        }
      })().finally(() => {
        running = false;
        turns.delete(turn);
      });
      turns.set(turn, timer.name);
    }));
  };

  return {
    /**
     * Starts the timer controllers of the contexts: the server calls it once it serves. A second call starts nothing more. Each rhythm is
     * checked before any timer runs: a timer that is refused leaves none running.
     */
    start: () => {
      if (cancels.length > 0) return;
      const timers = [...contexts.values()].flatMap(context => context.timers.map(timer => ({ context, timer, every: rhythmOf(context, timer) })));
      for (const { context, timer, every } of timers) run(context, timer, every);
    },
    /**
     * Stops what start started, and releases what the containers built: the server calls it when it stops. It ends the events of the
     * contexts first: a feed has no end, and would hold the requests that the server waits for. Then it cancels the timers, and aborts
     * the signal of the turns that run: a work in the background stops with the server. It waits for the turns, for the requests that the
     * server still serves (`requestsDone`), and for the reactions to the events, until the grace ends (`graceOver`, no limit without it).
     * Then the signal of the reactions aborts, and the turns and the reactions that still run get one more second, after which the backend
     * reports them. Last, it releases what each context built, then what shared built. A failure to release is reported.
     */
    stop: async (requestsDone?: Promise<unknown>, graceOver?: AbortSignal) => {
      stopping.abort();
      for (const cancel of cancels.splice(0)) cancel();
      turnsEnd.abort();
      const done = (async () => {
        while (turns.size > 0) await Promise.all([...turns.keys()]);
        await requestsDone;
        await eventBus.settled();
      })();
      if (graceOver === undefined) await done;
      else {
        await untilEndOrAbort(done, graceOver);
        reactionsEnd.abort();
        const late = new AbortController();
        const timer = setTimeout(() => { late.abort(); }, LAST_WAIT_MS);
        await untilEndOrAbort(done, late.signal);
        clearTimeout(timer);
        const running = [...[...turns.values()].map(name => `a turn of ${name}`), ...[...reactions.values()].map(name => `a reaction with ${name}`)];
        if (running.length > 0) reportError(new Error(`The backend stopped before these ended: ${running.join(", ")}`));
      }
      for (const container of [...[...contexts.values()].map(({ container }) => container), shared]) {
        try {
          await container.dispose();
        } catch (error) {
          reportError(error);
        }
      }
    },
    /** Sends an input DTO to the context that handles it, in a request of its own. */
    send,
    /** The controller of a context, built for a request. */
    controller: <C>(controller: abstract new (...args: never[]) => C, request: Correlation = SYSTEM): C =>
      requestOf(ownerOf(controller, () => new Error(`No context has the controller ${controller.name}: write it in the folder of its use case, as <use-case>.<name>.controller.ts`)), request)
        .scope.create(controller as unknown as Concrete<C>),
    /** Publishes an event of shared on the shared bus. */
    publish: (event: DomainEvent, request: Correlation = SYSTEM) => { eventBus.publish(event, request); },
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
