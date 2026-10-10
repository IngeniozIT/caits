import { bind } from "caits/di/Container";
import { GreetingsGateway } from "./domain/port/greetings-gateway/GreetingsGateway.js";
import { HttpGreetingsGateway } from "./infra/greetings-gateway/http-greetings-gateway.js";

export default [
  bind(GreetingsGateway).to(HttpGreetingsGateway)
];
