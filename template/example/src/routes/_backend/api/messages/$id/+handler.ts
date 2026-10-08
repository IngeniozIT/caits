import { controller } from "@ingeniozit/caits/di/backend";
import { EditMessageHttpController } from "#backend/messages/presentation/edit-message-http/edit-message-http.controller.js";
import { RemoveMessageHttpController } from "#backend/messages/presentation/remove-message-http/remove-message-http.controller.js";

/** The routes only give the request to the controller of the context: the controller reads the id in the path. */
export const PUT = Run.PUT(async (ctx): Promise<Response> => controller(EditMessageHttpController).handle(ctx.request));

export const DELETE = Run.DELETE(async (ctx): Promise<Response> => controller(RemoveMessageHttpController).handle(ctx.request));
