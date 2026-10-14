import type { GreetingsLoaded } from "./GreetingsLoaded.js";
import type { GreetingsRequested } from "./GreetingsRequested.js";

export type GreetingsEvent = GreetingsRequested | GreetingsLoaded;
