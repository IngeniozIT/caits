import type { MessageBus } from "./MessageBus.js";
import { reportToConsole, type ReportError } from "./ReportError.js";
import { BodyTooLargeError, CrossSiteRequestError, InvalidInputError, MalformedBodyError, Request, UnsupportedMediaTypeError } from "./Request.js";

// The errors of a request that a controller reads, which its toErrorResponse answers.
export { BodyTooLargeError, CrossSiteRequestError, InvalidInputError, MalformedBodyError, MAX_BODY_SIZE, UnsupportedMediaTypeError } from "./Request.js";

const problemType = (slug: string) => `urn:caits:problem:${slug}`;

export function problem(status: number, slug: string, title: string, detail?: string, extensions: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ type: problemType(slug), title, status, detail, ...extensions }), {
    status,
    headers: { "content-type": "application/problem+json" }
  });
}

/**
 * The response to an error of the request or of the application. A body that is neither JSON nor a form is a 415, a
 * body too large a 413, a form that a browser sends from another site a 403, a body that is not JSON, or not the form that it says, a
 * 400, a body that toDto refuses a 422 with its issues, and any other error is an internal server error, which is reported and tells
 * nothing.
 */
export function errorResponseOf(error: unknown, reportError: ReportError): Response {
  if (error instanceof UnsupportedMediaTypeError) return problem(415, "unsupported-media-type", "Unsupported media type", error.message);
  if (error instanceof BodyTooLargeError) return problem(413, "request-body-too-large", "Request body too large", error.message);
  if (error instanceof CrossSiteRequestError) return problem(403, "cross-site-request", "Cross-site request", error.message);
  if (error instanceof MalformedBodyError) return problem(400, "invalid-request-body", "Invalid request body", error.message);
  if (error instanceof InvalidInputError) return problem(422, "invalid-request-body", "Invalid request body", error.message, { issues: error.details });
  reportError(error);
  return problem(500, "internal-server-error", "Internal server error");
}

/**
 * Turns a request into an input DTO, sends it to the message bus of the request, and turns the output or the error into a response. It
 * reads the request through the Request of CAITS, which gives the content of the body at each call, and gives the bus the signal of the
 * request with the DTO: its handler sees its client leave.
 */
export abstract class Controller<Dto extends object, Output> {
  constructor(private bus: MessageBus, protected readonly reportError: ReportError = reportToConsole) {}

  protected abstract toDto(request: Request): Dto | Promise<Dto>;

  protected abstract toResponse(output: Output, request: Request): Response | Promise<Response>;

  /**
   * The response to an error of the request or of the application. A body that is neither JSON nor a form is a 415, a
   * body too large a 413, a form that a browser sends from another site a 403, a body that is not JSON, or not the form that it says, a
   * 400, a body that toDto refuses a 422 with its issues, and any other error is an internal server error. A controller answers its own
   * errors first, then calls super.
   */
  protected toErrorResponse(error: unknown, _request: Request): Response | Promise<Response> {
    return errorResponseOf(error, this.reportError);
  }

  /** Answers a request of the web: toDto, toResponse and toErrorResponse read it through the Request of CAITS. */
  async handle(received: globalThis.Request): Promise<Response> {
    const request = new Request(received);
    try {
      let output: Output;
      try {
        output = await this.bus.send(await this.toDto(request), { signal: request.signal }) as Output;
      } catch (error) {
        return await this.toErrorResponse(error, request);
      }
      return await this.toResponse(output, request);
    } catch (failure) {
      return errorResponseOf(failure, this.reportError);
    }
  }
}
