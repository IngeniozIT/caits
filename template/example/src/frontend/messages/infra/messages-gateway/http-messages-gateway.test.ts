import { afterEach, describe, expect, test, vi } from "@ingeniozit/caits/testing/frontend/infra";
import { describeMessagesGatewayContract } from "#context/domain/port/messages-gateway/MessagesGateway.contract.js";
import { HttpMessagesGateway } from "./http-messages-gateway.js";

afterEach(() => vi.unstubAllGlobals());

/** A small API of messages, as the backend answers. */
describeMessagesGatewayContract("Http", ({ messages, unavailable, refusal }) => {
  let held = messages.map(({ id, text }) => ({ id, text }));
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET") return unavailable ? new Response("down", { status: 503 }) : Response.json({ messages: held });
    if (refusal !== undefined) return Response.json({ type: "urn:caits:problem:invalid-message", title: "Invalid message", status: 422, detail: refusal }, { status: 422 });
    const id = decodeURIComponent(url.split("/").at(-1) ?? "");
    const text = method === "DELETE" ? "" : (JSON.parse(init?.body as string) as { text: string }).text;
    if (method === "POST") held = [...held, { id: `m${held.length + 1}`, text }];
    if (method === "PUT") held = held.map(message => message.id === id ? { id, text } : message);
    if (method === "DELETE") held = held.filter(message => message.id !== id);
    return new Response(null, { status: 204 });
  }));
  return new HttpMessagesGateway();
});

describe("HttpMessagesGateway on the wire", () => {
  const fetcherAnswering = (response: Response) => vi.fn(async (_url: string, _init?: RequestInit) => response);

  test("asks the API through the fetcher it is given", async () => {
    const fetcher = fetcherAnswering(Response.json({ messages: [] }));
    await new HttpMessagesGateway(fetcher).list();
    expect(fetcher).toHaveBeenCalledWith("/api/messages", undefined);
  });

  test("posts a new message as JSON", async () => {
    const fetcher = fetcherAnswering(Response.json({ id: "m1", text: "Hello" }, { status: 201 }));
    await new HttpMessagesGateway(fetcher).add("Hello");
    expect(fetcher).toHaveBeenCalledWith("/api/messages", { method: "POST", headers: { "content-type": "application/json" }, body: '{"text":"Hello"}' });
  });

  test("puts the new text at the address of the message", async () => {
    const fetcher = fetcherAnswering(Response.json({ id: "a b", text: "Hello" }));
    await new HttpMessagesGateway(fetcher).edit("a b", "Hello");
    expect(fetcher).toHaveBeenCalledWith("/api/messages/a%20b", { method: "PUT", headers: { "content-type": "application/json" }, body: '{"text":"Hello"}' });
  });

  test("deletes the message at its address", async () => {
    const fetcher = fetcherAnswering(new Response(null, { status: 204 }));
    await new HttpMessagesGateway(fetcher).remove("a b");
    expect(fetcher).toHaveBeenCalledWith("/api/messages/a%20b", { method: "DELETE" });
  });

  test("a failure without an explanation is reported by its status", async () => {
    await expect(new HttpMessagesGateway(fetcherAnswering(new Response("down", { status: 503 }))).remove("m1")).rejects.toThrow("HTTP 503");
  });
});
