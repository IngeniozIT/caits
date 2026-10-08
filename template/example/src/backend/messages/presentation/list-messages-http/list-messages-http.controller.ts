import { Controller } from "@ingeniozit/caits/messaging/Controller";
import { ListMessagesQuery, type ListMessagesOutput } from "#context/application/query/list-messages/list-messages.dto.js";

/** GET /api/messages. */
export class ListMessagesHttpController extends Controller<ListMessagesQuery, ListMessagesOutput> {
  protected toDto(): ListMessagesQuery {
    return new ListMessagesQuery();
  }

  protected toResponse(output: ListMessagesOutput): Response {
    return Response.json(output);
  }
}
