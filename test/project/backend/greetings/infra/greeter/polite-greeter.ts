import type { Greeter } from "../../domain/port/greeter/Greeter.js";

export class PoliteGreeter implements Greeter {
  constructor(private readonly salutation: string) {}

  greet(name: string): string {
    return `${this.salutation}, ${name}`;
  }
}
