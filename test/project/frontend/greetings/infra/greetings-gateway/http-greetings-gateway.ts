import type { Fetcher } from "@ingenioz-it/caits/di/Fetcher";
import type { GreetingsGateway } from "../../domain/port/greetings-gateway/GreetingsGateway.js";

export class HttpGreetingsGateway implements GreetingsGateway {
  constructor(private readonly fetcher: Fetcher) {}

  async list(): Promise<string[]> {
    const response = await this.fetcher("/api/greetings");
    return ((await response.json()) as { greetings: string[] }).greetings;
  }
}
