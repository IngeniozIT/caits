import { controller } from "@ingeniozit/caits/di/backend";
import { AddMessageHttpController } from "#backend/messages/presentation/add-message-http/add-message-http.controller.js";
import { ListMessagesHttpController } from "#backend/messages/presentation/list-messages-http/list-messages-http.controller.js";

/** The routes only give the request to the controller of the context. */
export const GET = Run.GET(async (ctx): Promise<Response> => controller(ListMessagesHttpController).handle(ctx.request));

export const POST = Run.POST(async (ctx): Promise<Response> => controller(AddMessageHttpController).handle(ctx.request));
