import { Controller, problem } from "@ingeniozit/caits/messaging/Controller";
import { RemoveMessageCommand, type RemoveMessageOutput } from "#context/application/command/remove-message/remove-message.dto.js";
import { MessageNotFoundError } from "#context/domain/error/MessageNotFoundError.js";

/** The id is the last part of the path: /api/messages/{id}. */
const idOf = (request: Request) => {
  const { pathname } = new URL(request.url);
  return decodeURIComponent(pathname.slice(pathname.lastIndexOf("/") + 1));
};

/** DELETE /api/messages/{id}: turns the request into a RemoveMessageCommand. A removal answers with no content. */
export class RemoveMessageHttpController extends Controller<RemoveMessageCommand, RemoveMessageOutput> {
  protected toDto(request: Request): RemoveMessageCommand {
    return new RemoveMessageCommand(idOf(request));
  }

  protected toResponse(): Response {
    return new Response(null, { status: 204 });
  }

  protected override toErrorResponse(error: unknown, request: Request): Response | Promise<Response> {
    if (error instanceof MessageNotFoundError) return problem(404, "message-not-found", "Message not found", error.message);
    return super.toErrorResponse(error, request);
  }
}
