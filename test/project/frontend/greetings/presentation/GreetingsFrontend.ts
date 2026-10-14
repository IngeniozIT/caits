import type { Frontend } from "@ingenioz-it/caits/state/request";
import type { GreetingsEvent } from "../event/GreetingsEvent.js";
import type { GreetingsState } from "./store/greetingsStore.js";

export type GreetingsFrontend = Frontend<GreetingsState, GreetingsEvent>;

declare module "@ingenioz-it/caits/di/frontend" {
  interface Frontends { greetings: GreetingsFrontend }
}
