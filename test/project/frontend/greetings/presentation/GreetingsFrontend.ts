import type { Frontend } from "@ingeniozits/kernel/state/request";
import type { GreetingsEvent } from "../application/event/GreetingsEvent.js";
import type { GreetingsState } from "./store/greetingsStore.js";

export type GreetingsFrontend = Frontend<GreetingsState, GreetingsEvent>;

declare module "@ingeniozits/kernel/di/frontend" {
  interface Frontends { greetings: GreetingsFrontend }
}
