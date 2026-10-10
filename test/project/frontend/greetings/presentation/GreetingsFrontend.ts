import type { Frontend } from "caits/state/request";
import type { GreetingsEvent } from "../application/event/GreetingsEvent.js";
import type { GreetingsState } from "./store/greetingsStore.js";

export type GreetingsFrontend = Frontend<GreetingsState, GreetingsEvent>;

declare module "caits/di/frontend" {
  interface Frontends { greetings: GreetingsFrontend }
}
