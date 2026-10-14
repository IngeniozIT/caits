import { Input } from "@ingenioz-it/caits/messaging/Input";

export class GreetCommand extends Input<GreetOutput> {
  constructor(readonly name: string) {
    super();
  }
}

export class GreetOutput {
  constructor(readonly greeting: string) {}
}
