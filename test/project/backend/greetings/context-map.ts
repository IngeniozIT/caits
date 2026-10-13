import { share } from "@ingenioz-it/caits/messaging/ContextMap";
import { PersonGreeted } from "../shared/domain/event/PersonGreeted.js";
import { Greeted } from "./domain/event/Greeted.js";

export default [share(Greeted, event => [new PersonGreeted(event.name)])];
