import { when } from "@ingenioz-it/caits/messaging/FrontendContextMap";
import { GreetingsAsked } from "../shared/event/GreetingsAsked.js";
import { GreetingsRequested } from "./event/GreetingsRequested.js";

/** The events of shared that the context hears, as its own events. */
export default [
  when(GreetingsAsked, () => [new GreetingsRequested()])
];
