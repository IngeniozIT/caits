import { Token } from "@ingeniozits/kernel/Token";

export interface GreetingsGateway {
  list(): Promise<string[]>;
}

export const GreetingsGateway = new Token<GreetingsGateway>();
