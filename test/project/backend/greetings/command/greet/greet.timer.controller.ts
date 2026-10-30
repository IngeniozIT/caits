import { TimerController } from "@ingenioz-it/caits/messaging/TimerController";
import { GreetCommand } from "./greet.dto.js";

/** Greets the world every minute, while the server runs: the kernel starts it when the server boots. */
export class GreetTimerController extends TimerController<GreetCommand> {
  readonly every = 60_000;

  protected toDto(): GreetCommand {
    return new GreetCommand("world");
  }
}
