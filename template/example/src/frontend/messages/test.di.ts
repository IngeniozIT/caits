import { bind } from "@ingeniozit/caits/di/Container";
import { MessagesGateway } from "./domain/port/messages-gateway/MessagesGateway.js";
import { FakeMessagesGateway } from "./infra/messages-gateway/fake-messages-gateway.js";

/** The dependencies of the tests: they replace those of di.ts. */
export default [
  bind(MessagesGateway).to(FakeMessagesGateway)
];
