import type { Fetcher } from "@ingeniozit/caits/di/Fetcher";
import { failureOf } from "@ingeniozit/caits/http/failureOf";
import { Message } from "#context/domain/entity/Message.js";
import type { MessagesGateway } from "#context/domain/port/messages-gateway/MessagesGateway.js";

/** A message, as the API of the backend gives it. */
type MessageJson = { id: string; text: string };

const jsonBody = (body: unknown) => ({ headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** Talks to the API of the backend. On the server, the fetcher calls the backend in process; in the browser, it is `fetch`. */
export class HttpMessagesGateway implements MessagesGateway {
  constructor(private readonly fetcher: Fetcher = (input, init) => fetch(input, init)) {}

  async list(): Promise<Message[]> {
    const response = await this.send("/api/messages");
    return ((await response.json()) as { messages: MessageJson[] }).messages.map(({ id, text }) => new Message(id, text));
  }

  async add(text: string): Promise<void> {
    await this.send("/api/messages", { method: "POST", ...jsonBody({ text }) });
  }

  async edit(id: string, text: string): Promise<void> {
    await this.send(`/api/messages/${encodeURIComponent(id)}`, { method: "PUT", ...jsonBody({ text }) });
  }

  async remove(id: string): Promise<void> {
    await this.send(`/api/messages/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  private async send(path: string, init?: RequestInit): Promise<Response> {
    const response = await this.fetcher(path, init);
    if (!response.ok) throw await failureOf(response);
    return response;
  }
}
