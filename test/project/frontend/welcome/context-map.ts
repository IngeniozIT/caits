import { share } from "@ingenioz-it/caits/messaging/FrontendContextMap";
import { GreetingsAsked } from "../shared/event/GreetingsAsked.js";
import { WelcomeShown } from "./event/WelcomeShown.js";

/** The events of the context that it shares: the welcome shown, the contexts that hear it ask for their greetings. */
export default [
  share(WelcomeShown, () => [new GreetingsAsked()])
];
