import { Token } from "@ingenioz-it/caits/Token";

export interface GreetingsGateway {
  list(): Promise<string[]>;
}

export const GreetingsGateway = new Token<GreetingsGateway>();
