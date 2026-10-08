import type { Input } from "./Input.js";
import type { MessageBus } from "./MessageBus.js";
import { reportToConsole, type ReportError } from "./ReportError.js";

export class InvalidInputError extends Error {
  constructor(message: string, readonly details?: unknown) {
    super(message);
    this.name = "InvalidInputError";
  }
}

export class MalformedBodyError extends InvalidInputError {}

/** The JSON of the body, whatever the request says its content is. */
export async function readBody(request: Request): Promise<unknown> {
  try {
    return await request.clone().json();
  } catch {
    throw new MalformedBodyError("Invalid JSON");
  }
}

const problemType = (slug: string) => `urn:caits:problem:${slug}`;

export function problem(status: number, slug: string, title: string, detail?: string, extensions: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ type: problemType(slug), title, status, detail, ...extensions }), {
    status,
    headers: { "content-type": "application/problem+json" }
  });
}

/** Turns a request into an input DTO, sends it to the message bus of the request, and turns the output or the error into a response. */
export abstract class Controller<Dto extends Input<Output>, Output> {
  constructor(private bus: MessageBus, private reportError: ReportError = reportToConsole) {}

  protected abstract toDto(request: Request): Dto | Promise<Dto>;

  protected abstract toResponse(output: Output, request: Request): Response | Promise<Response>;

  /**
   * The response to an error of the request or of the application. A body that is not JSON is a 400, a body that toDto refuses is a 422
   * with its issues, and any other error is an internal server error. A controller answers its own errors first, then calls super.
   */
  protected toErrorResponse(error: unknown, _request: Request): Response | Promise<Response> {
    if (error instanceof MalformedBodyError) return problem(400, "invalid-request-body", "Invalid request body", error.message);
    if (error instanceof InvalidInputError) return problem(422, "invalid-request-body", "Invalid request body", error.message, { issues: error.details });
    return this.internalServerError(error);
  }

  async handle(request: Request): Promise<Response> {
    try {
      let output: Output;
      try {
        output = await this.bus.send(await this.toDto(request));
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
