import type { MessageBus } from "./MessageBus.js";
import { reportToConsole, type ReportError } from "./ReportError.js";

export class InvalidInputError extends Error {
  constructor(message: string, readonly details?: unknown) {
    super(message);
    this.name = "InvalidInputError";
  }
}

export class MalformedBodyError extends InvalidInputError {}

export class UnsupportedMediaTypeError extends InvalidInputError {}

export class BodyTooLargeError extends InvalidInputError {}

/** The largest body that readBody reads by default, in bytes: 1 MB. */
export const MAX_BODY_SIZE = 1024 * 1024;

/**
 * A JSON media type, in any case: application/json, or a type with the suffix +json (application/merge-patch+json). Parameters can
 * follow, after a ";". A parameter is not the type: a browser sends `text/plain;x+json` from any site, as text/plain.
 */
const JSON_MEDIA_TYPE = /^(?:application\/json|[^\s/]+\/[^\s/;]+\+json)\s*(?:;|$)/i;

/**
 * The JSON of the body. The request must say that its body is JSON: content-type application/json, or a type with the suffix +json.
 * A browser sends a body of another type (text/plain, a form) from any site, without asking the server first: such a request cannot
 * change the data of the app. The body must not be larger than `maxSize` bytes (MAX_BODY_SIZE, 1 MB, by default): the rest of a
 * larger body is not read. The request stays readable.
 * @throws {UnsupportedMediaTypeError} when the request does not say that its body is JSON: the Controller answers 415.
 * @throws {BodyTooLargeError} when the body is larger than `maxSize`: the Controller answers 413.
 * @throws {MalformedBodyError} when the body is not JSON: the Controller answers 400.
 */
export async function readBody(request: Request, maxSize = MAX_BODY_SIZE): Promise<unknown> {
  const contentType = request.headers.get("content-type");
  if (!contentType?.match(JSON_MEDIA_TYPE)) throw new UnsupportedMediaTypeError("The content type must be application/json");
  const text = await textOf(request.clone(), maxSize);
  try {
    return JSON.parse(text);
  } catch {
    throw new MalformedBodyError("Invalid JSON");
  }
}

/** The text of the body, read chunk by chunk: the reading stops at the first chunk after `maxSize` bytes. */
async function textOf(request: Request, maxSize: number): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  const reader = request.body?.getReader();
  for (let chunk = await reader?.read(); chunk && !chunk.done; chunk = await reader?.read()) {
    size += chunk.value.byteLength;
    if (size > maxSize) throw new BodyTooLargeError(`The body is larger than ${maxSize} bytes`);
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text + decoder.decode();
}

const problemType = (slug: string) => `urn:caits:problem:${slug}`;

export function problem(status: number, slug: string, title: string, detail?: string, extensions: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ type: problemType(slug), title, status, detail, ...extensions }), {
    status,
    headers: { "content-type": "application/problem+json" }
  });
}

/** Turns a request into an input DTO, sends it to the message bus of the request, and turns the output or the error into a response. */
export abstract class Controller<Dto extends object, Output> {
  constructor(private bus: MessageBus, private reportError: ReportError = reportToConsole) {}

  protected abstract toDto(request: Request): Dto | Promise<Dto>;

  protected abstract toResponse(output: Output, request: Request): Response | Promise<Response>;

  /**
   * The response to an error of the request or of the application. A body that does not say it is JSON is a 415, a body too large a 413,
   * a body that is not JSON a 400, a body that toDto refuses a 422 with its issues, and any other error is an internal server error. A
   * controller answers its own errors first, then calls super.
   */
  protected toErrorResponse(error: unknown, _request: Request): Response | Promise<Response> {
    if (error instanceof UnsupportedMediaTypeError) return problem(415, "unsupported-media-type", "Unsupported media type", error.message);
    if (error instanceof BodyTooLargeError) return problem(413, "request-body-too-large", "Request body too large", error.message);
    if (error instanceof MalformedBodyError) return problem(400, "invalid-request-body", "Invalid request body", error.message);
    if (error instanceof InvalidInputError) return problem(422, "invalid-request-body", "Invalid request body", error.message, { issues: error.details });
    return this.internalServerError(error);
  }

  async handle(request: Request): Promise<Response> {
    try {
      let output: Output;
      try {
        output = await this.bus.send(await this.toDto(request)) as Output;
      } catch (error) {
        return await this.toErrorResponse(error, request);
      }
      return await this.toResponse(output, request);
    } catch (failure) {
      return this.internalServerError(failure);
    }
  }

  private internalServerError(error: unknown): Response {
    this.reportError(error);
    return problem(500, "internal-server-error", "Internal server error");
  }
}
