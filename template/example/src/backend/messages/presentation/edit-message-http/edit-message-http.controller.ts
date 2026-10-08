import { Controller, InvalidInputError, problem, readBody } from "@ingeniozit/caits/messaging/Controller";
import { EditMessageCommand, type EditMessageOutput } from "#context/application/command/edit-message/edit-message.dto.js";
import { InvalidMessageError } from "#context/domain/error/InvalidMessageError.js";
import { MessageNotFoundError } from "#context/domain/error/MessageNotFoundError.js";

/** The id is the last part of the path: /api/messages/{id}. */
const idOf = (request: Request) => {
  const { pathname } = new URL(request.url);
  return decodeURIComponent(pathname.slice(pathname.lastIndexOf("/") + 1));
};

/** The body that the API reads: `{ "text": "…" }`. */
const isBody = (body: unknown): body is { text: string } => typeof (body as { text?: unknown } | null)?.text === "string";

/** PUT /api/messages/{id}: turns the request into an EditMessageCommand, and the output or the error into a response. */
export class EditMessageHttpController extends Controller<EditMessageCommand, EditMessageOutput> {
  protected async toDto(request: Request): Promise<EditMessageCommand> {
    const body = await readBody(request);
    if (!isBody(body)) throw new InvalidInputError("Invalid body", [{ path: ["text"], message: "The text must be a string." }]);
    return new EditMessageCommand(idOf(request), body.text);
  }

  protected toResponse(output: EditMessageOutput): Response {
    return Response.json(output);
  }

  protected override toErrorResponse(error: unknown, request: Request): Response | Promise<Response> {
    if (error instanceof InvalidMessageError) return problem(422, "invalid-message", "Invalid message", error.message);
    if (error instanceof MessageNotFoundError) return problem(404, "message-not-found", "Message not found", error.message);
    return super.toErrorResponse(error, request);
  }
}
