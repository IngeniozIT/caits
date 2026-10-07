import { Token } from "@ingeniozit/caits/Token";

export interface Greeter {
  greet(name: string): string;
}

export const Greeter = new Token<Greeter>();
