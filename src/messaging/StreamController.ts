import type { DomainEvent } from "../DomainEvent.js";
import type { ContextEvents } from "./ContextEvents.js";
import { errorResponseOf } from "./Controller.js";
import type { MessageBus } from "./MessageBus.js";
import { reportToConsole, type ReportError } from "./ReportError.js";
import { Request } from "./Request.js";
import type { RequestEvents } from "./RequestEvents.js";
import { SSE_HEADERS, sseComment, sseEvent } from "./sse.js";

/**
 * What comes to the stream: an event that a handler published, the output of the handler, or its error; or the text of an event of a
 * request, which came before the stream started.
 */
type Item = { readonly event: DomainEvent } | { readonly output: unknown } | { readonly error: unknown } | { readonly text: string };

/**
 * Turns a request into an input DTO, sends it to the message bus, and streams the answer as server-sent events: what the handler
 * publishes, as it publishes it, then its output. It answers before the handler ends.
 * - `follows` says which events it writes: those that the handlers of its request publish ("request"), until the handler answers; or
 *   those of every request of its context ("context"), after the output of its handler, the state at the start, until the client leaves.
 *   An event of the context may come while the handler reads the state, and be in it already: `stateHolds` says so, and the feed does
 *   not write it again. A feed ends when the events of its context end, as the backend stops: its client comes back to the next one. A
 *   stream of a request goes on, as any request that the server lets end.
 * - An EventSource, in a browser, connects again to a stream that ends, with the same GET: a feed gives its state again. It would run the
 *   use case of a stream of a request again and again: its client closes it at the last event, or the API takes POST.
 * - Until the first event that it writes, or the output, an error is a response, as a Controller gives it (`toErrorResponse`): an event
 *   that it does not write, as one for another context, decides nothing, since the client reads nothing of it. An event that it cannot
 *   write is then an error too. Once the stream started, an error goes in the stream (`toErrorChunk`), which ends: an error of the
 *   handler, or of the controller as it writes the stream (`toChunk`, `toOutputChunk`, `stateHolds`, `toKeepAlive`). An error that
 *   `toErrorChunk` cannot write is reported, with the error of `toErrorChunk`.
 * - When the stream says nothing for `keepAliveMs`, a comment keeps the connection alive.
 * - It gives the bus the signal of the request with the DTO: the signal aborts when the client leaves, or stops reading the stream, or
 *   when the controller cannot write the stream, and the handler reads it in its RequestContext.
 * - A request that asks for no stream (`streams`) gets the response to the output (`toResponse`), once the handler answers, as from a
 *   Controller: an API that streams or not at the same address, as the request says.
 * - It reads the request through the Request of CAITS, which gives the content of the body at each call.
 */
export abstract class StreamController<Dto extends object, Output> {
  /** The events that it writes: those of its request, or those of its context. */
  protected readonly follows: "request" | "context" = "request";
  /** How long the stream may stay silent before a comment keeps the connection alive, in milliseconds. */
  protected readonly keepAliveMs: number = 15_000;

  constructor(
    private bus: MessageBus,
    private requestEvents: RequestEvents,
    private contextEvents: ContextEvents,
    protected readonly reportError: ReportError = reportToConsole
  ) {}

  protected abstract toDto(request: Request): Dto | Promise<Dto>;

  /** The text of an event in the stream: nothing writes nothing. */
  protected abstract toChunk(event: DomainEvent): string | undefined;

  /** The text of the output in the stream: the end of the answer of a request, or the state at the start of a feed. */
  protected abstract toOutputChunk(output: Output): string | undefined;

  /** The response to an error before the stream starts: as a Controller gives it. A controller answers its own errors first. */
  protected toErrorResponse(error: unknown, _request: Request): Response | Promise<Response> {
    return errorResponseOf(error, this.reportError);
  }

  /**
   * The text of an error once the stream started: the error is reported, and the event tells nothing of it. The event is a "problem",
   * as CAITS names its errors: an EventSource, in a browser, gives the name "error" to a connection that fails or ends.
   */
  protected toErrorChunk(error: unknown): string {
    this.reportError(error);
    return sseEvent(JSON.stringify({ title: "Internal server error" }), { event: "problem" });
  }

  /**
   * Whether the state at the start of a feed holds an event that came before it already: the feed writes it only when the state does
   * not hold it. It writes each event that comes after the state. A state holds no event by default.
   */
  protected stateHolds(_state: Output, _event: DomainEvent): boolean {
    return false;
  }

  /** Whether the request asks for a stream: each one does by default. */
  protected streams(_dto: Dto): boolean {
    return true;
  }

  /** The response to the output, for a request that asks for no stream: the output in JSON by default. */
  protected toResponse(output: Output, _request: Request): Response | Promise<Response> {
    return Response.json(output);
  }

  protected headers(): HeadersInit {
    return SSE_HEADERS;
  }

  protected toKeepAlive(): string {
    return sseComment("keep-alive");
  }

  /** Answers a request of the web: the methods of the controller read it through the Request of CAITS. */
  async handle(received: globalThis.Request): Promise<Response> {
    try {
      return await this.respond(new Request(received));
    } catch (failure) {
      // A response to an error that fails too: the answer of a Controller.
      return errorResponseOf(failure, this.reportError);
    }
  }

  private async respond(request: Request): Promise<Response> {
    let dto: Dto;
    try {
      dto = await this.toDto(request);
    } catch (error) {
      return this.toErrorResponse(error, request);
    }
    if (!this.streams(dto)) return this.answer(dto, request);
    const queue: Item[] = [];
    let wake: () => void = () => {};
    // The client leaves when its request aborts, or when it stops reading the stream.
    const cancelled = new AbortController();
    // Before the stream starts, a stream of a request writes each event as it comes: the first text that it writes starts the stream. A
    // feed keeps its events, which its state may hold.
    let take: (item: Item) => void = item => {
      let kept = item;
      if (this.follows === "request" && "event" in item) {
        try {
          const text = this.toChunk(item.event);
          if (text === undefined) return;
          kept = { text };
        } catch (error) {
          // No one reads what the handler does next: it stops.
          cancelled.abort();
          kept = { error };
        }
      }
      queue.push(kept);
      wake();
    };
    const stopListening = (this.follows === "request" ? this.requestEvents : this.contextEvents).subscribe(event => { take({ event }); });
    const answering = this.bus.send(dto, { signal: AbortSignal.any([request.signal, cancelled.signal]) }).then(output => ({ output }), (error: unknown) => ({ error }));
    void answering.then(item => {
      // The output of a feed is its start: it goes first, below.
      if (this.follows === "request") take(item);
    });
    // A request waits for what comes first; a feed, for its start; both, until the client leaves.
    const { promise: left, resolve: leftNow } = Promise.withResolvers<undefined>();
    const leaveEarly = () => { leftNow(undefined); };
    request.signal.addEventListener("abort", leaveEarly);
    if (request.signal.aborted) leaveEarly();
    const first = await Promise.race([
      this.follows === "request" ? new Promise<Item>(resolve => { wake = () => { resolve(queue[0]); }; if (queue.length > 0) wake(); }) : answering,
      left
    ]);
    if (first === undefined) {
      stopListening();
      // No one reads it: 499, as servers write in their logs a client that left.
      return new Response(null, { status: 499 });
    }
    if ("error" in first) {
      stopListening();
      return this.toErrorResponse(first.error, request);
    }
    // A feed starts with its state, the output of its handler. The events that came before it may be in it already. A stream of a
    // request keeps no event before it starts: it wrote each one as it came.
    const early = new Set(queue);
    if (this.follows === "context") queue.unshift(first);

    const encoder = new TextEncoder();
    let open = true;
    let silence: ReturnType<typeof setTimeout> | undefined;
    const ended = new AbortController();
    const end = () => {
      open = false;
      clearTimeout(silence);
      stopListening();
      ended.abort();
    };
    const leave = () => {
      end();
      cancelled.abort();
    };
    request.signal.addEventListener("abort", leave);
    const body = new ReadableStream<Uint8Array>({
      start: stream => {
        const close = () => {
          end();
          stream.close();
        };
        // The silence counts from the last text written: an event that writes nothing breaks no silence.
        const quiet = () => {
          clearTimeout(silence);
          silence = setTimeout(() => {
            try {
              write(this.toKeepAlive());
            } catch (error) {
              failToWrite(error);
            }
          }, this.keepAliveMs);
        };
        const write = (text: string | undefined) => {
          if (text === undefined) return;
          stream.enqueue(encoder.encode(text));
          quiet();
        };
        // An error ends the stream with its event; when the controller cannot write the event, it reports both errors.
        const fail = (error: unknown) => {
          try {
            write(this.toErrorChunk(error));
          } catch (failure) {
            this.reportError(error);
            this.reportError(failure);
          }
          close();
        };
        // No one reads what the handler does next: it stops, as when the client leaves.
        const failToWrite = (error: unknown) => {
          fail(error);
          cancelled.abort();
        };
        take = item => {
          if (!open) return;
          try {
            if ("text" in item) {
              write(item.text);
            } else if ("event" in item) {
              if (!(early.has(item) && this.stateHolds((first as { readonly output: Output }).output, item.event))) write(this.toChunk(item.event));
            } else if ("error" in item) {
              fail(item.error);
            } else {
              write(this.toOutputChunk(item.output as Output));
              if (this.follows === "request") close();
            }
          } catch (error) {
            failToWrite(error);
          }
        };
        quiet();
        for (const item of queue.splice(0)) take(item);
        // A feed ends with the events of its context, as the backend stops.
        if (open && this.follows === "context") {
          const { signal } = this.contextEvents;
          signal.addEventListener("abort", close, { signal: ended.signal });
          if (signal.aborted) close();
        }
      },
      cancel: leave
    });
    return new Response(body, { status: 200, headers: this.headers() });
  }

  /** Sends the DTO with the signal of the request, and answers as a Controller does once the handler answers. */
  private async answer(dto: Dto, request: Request): Promise<Response> {
    let output: Output;
    try {
      output = await this.bus.send(dto, { signal: request.signal }) as Output;
    } catch (error) {
      return await this.toErrorResponse(error, request);
    }
    return await this.toResponse(output, request);
  }
}
