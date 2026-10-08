import { bind } from "@ingeniozit/caits/di/Container";
import { MessagesGateway } from "./domain/port/messages-gateway/MessagesGateway.js";
import { HttpMessagesGateway } from "./infra/messages-gateway/http-messages-gateway.js";

export default [
  bind(MessagesGateway).to(HttpMessagesGateway)
];
