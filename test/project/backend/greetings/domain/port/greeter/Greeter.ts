import { Token } from "@ingeniozits/kernel/Token";

export interface Greeter {
  greet(name: string): string;
}

export const Greeter = new Token<Greeter>();
