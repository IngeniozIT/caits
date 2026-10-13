/** Its view tells that the visitor sees the welcome: the context map shares it, as the greetings that the other contexts show. */
export class WelcomeShown {
  readonly type = "welcome.shown" as const;
}
