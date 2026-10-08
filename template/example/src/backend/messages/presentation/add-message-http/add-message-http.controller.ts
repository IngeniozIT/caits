import { Controller, InvalidInputError, problem, readBody } from "@ingeniozit/caits/messaging/Controller";
import { AddMessageCommand, type AddMessageOutput } from "#context/application/command/add-message/add-message.dto.js";
import { InvalidMessageError } from "#context/domain/error/InvalidMessageError.js";

/** The body that the API reads: `{ "text": "…" }`. */
const isBody = (body: unknown): body is { text: string } => typeof (body as { text?: unknown } | null)?.text === "string";

/** POST /api/messages: turns the request into an AddMessageCommand, and the output or the error into a response. */
export class AddMessageHttpController extends Controller<AddMessageCommand, AddMessageOutput> {
  protected async toDto(request: Request): Promise<AddMessageCommand> {
    const body = await readBody(request);
    if (!isBody(body)) throw new InvalidInputError("Invalid body", [{ path: ["text"], message: "The text must be a string." }]);
    return new AddMessageCommand(body.text);
  }

  protected toResponse(output: AddMessageOutput): Response {
    return Response.json(output, { status: 201 });
  }

  protected override toErrorResponse(error: unknown, request: Request): Response | Promise<Response> {
    if (error instanceof InvalidMessageError) return problem(422, "invalid-message", "Invalid message", error.message);
    return super.toErrorResponse(error, request);
  }
}
