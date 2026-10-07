import { Token } from "../Token.js";
import type { ReportError } from "./ReportError.js";

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

const problemType = (slug: string) => `urn:spike:problem:${slug}`;

export function problem(status: number, slug: string, title: string, detail?: string, extensions: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ type: problemType(slug), title, status, detail, ...extensions }), {
    status,
    headers: { "content-type": "application/problem+json" }
  });
}

/** Where a controller sends its DTO: the message bus of the request. */
export interface Dispatcher<Dto, Output> { execute(dto: Dto): Promise<Output>; }

export const Dispatcher = new Token<Dispatcher<unknown, unknown>>();

export abstract class Controller<Dto, Output> {
  constructor(private bus: Dispatcher<Dto, Output>, private reportError: ReportError = error => { console.error(error); }) {}

  protected abstract toDto(request: Request): Dto | Promise<Dto>;

  protected abstract toResponse(output: Output, request: Request): Response | Promise<Response>;

  protected toErrorResponse(error: unknown, _request: Request): Response | Promise<Response> {
    return this.internalServerError(error);
  }

  async handle(request: Request): Promise<Response> {
    try {
      let output: Output;
      try {
        output = await this.bus.execute(await this.toDto(request));
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
