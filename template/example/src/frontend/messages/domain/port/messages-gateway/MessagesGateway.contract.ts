import { describe, expect, test } from "@ingeniozit/caits/testing/frontend/infra";
import { Message } from "#context/domain/entity/Message.js";
import type { MessagesGateway } from "./MessagesGateway.js";

/** The other side: the server, or what stands for it. `refusal`: the reason it refuses every change with. */
type Server = { messages: Message[]; unavailable?: boolean; refusal?: string };

const textsOf = async (gateway: MessagesGateway) => (await gateway.list()).map(message => message.text);

/** What every adapter of MessagesGateway does. The test of each adapter runs it. */
export function describeMessagesGatewayContract(name: string, create: (server: Server) => MessagesGateway) {
  describe(`MessagesGateway contract: ${name}`, () => {
    test("answers with the messages that the other side holds", async () => {
      expect(await create({ messages: [new Message("m1", "Hello")] }).list()).toStrictEqual([new Message("m1", "Hello")]);
    });

    test("an unavailable other side is an error", async () => {
      await expect(create({ messages: [], unavailable: true }).list()).rejects.toThrow();
    });

    test("adds a message: the list then ends with it", async () => {
      const gateway = create({ messages: [new Message("m1", "Hello")] });
      await gateway.add("Bye");
      expect(await textsOf(gateway)).toEqual(["Hello", "Bye"]);
    });

    test("edits a message: the list then gives its new text", async () => {
      const gateway = create({ messages: [new Message("m1", "Hello"), new Message("m2", "Bye")] });
      await gateway.edit("m1", "Hello again");
      expect(await gateway.list()).toStrictEqual([new Message("m1", "Hello again"), new Message("m2", "Bye")]);
    });

    test("removes a message, and only it", async () => {
      const gateway = create({ messages: [new Message("m1", "Hello"), new Message("m2", "Bye")] });
      await gateway.remove("m1");
      expect(await gateway.list()).toStrictEqual([new Message("m2", "Bye")]);
    });

    test("a refusal is an error that carries the reason, and changes nothing", async () => {
      const gateway = create({ messages: [new Message("m1", "Hello")], refusal: "A message cannot be empty." });
      await expect(gateway.add(" ")).rejects.toThrow("A message cannot be empty.");
      await expect(gateway.edit("m1", " ")).rejects.toThrow("A message cannot be empty.");
      await expect(gateway.remove("m1")).rejects.toThrow("A message cannot be empty.");
      expect(await textsOf(gateway)).toEqual(["Hello"]);
    });
  });
}
