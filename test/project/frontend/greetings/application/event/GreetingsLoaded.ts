export class GreetingsLoaded {
  readonly type = "greetings.loaded" as const;
  constructor(readonly greetings: string[]) {}
}
