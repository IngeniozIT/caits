import { Controller } from "@ingenioz-it/caits/messaging/Controller";
import { GreetCommand, type GreetOutput } from "./greet.dto.js";
import type { Request } from "@ingenioz-it/caits/messaging/Request";

export class GreetHttpController extends Controller<GreetCommand, GreetOutput> {
  protected toDto(request: Request): GreetCommand {
    return new GreetCommand(new URL(request.url).searchParams.get("name") ?? "");
  }

  protected toResponse(output: GreetOutput): Response {
    return Response.json(output);
  }
}
