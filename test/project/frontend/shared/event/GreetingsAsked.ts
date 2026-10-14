/** The context map of a context shares it on the shared bus, or a component of shared publishes it: the contexts that hear it ask for their greetings. */
export class GreetingsAsked {
  readonly type = "shared.greetings-asked" as const;
}
