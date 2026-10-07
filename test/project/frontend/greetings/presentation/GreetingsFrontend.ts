import type { Frontend } from "@ingeniozit/caits/state/request";
import type { GreetingsEvent } from "../application/event/GreetingsEvent.js";
import type { GreetingsState } from "./store/greetingsStore.js";

export type GreetingsFrontend = Frontend<GreetingsState, GreetingsEvent>;

declare module "@ingeniozit/caits/di/frontend" {
  interface Frontends { greetings: GreetingsFrontend }
}
