import { describe, expect, test } from "@ingeniozit/caits/testing/frontend/infra";
import { Message } from "#context/domain/entity/Message.js";
import { describeMessagesGatewayContract } from "#context/domain/port/messages-gateway/MessagesGateway.contract.js";
import { FakeMessagesGateway } from "./fake-messages-gateway.js";

describeMessagesGatewayContract("Fake", ({ messages, unavailable, refusal }) => {
  const gateway = new FakeMessagesGateway(messages);
  if (unavailable) gateway.failWith("HTTP 503");
  if (refusal !== undefined) gateway.refuseWith(refusal);
  return gateway;
});

describe("FakeMessagesGateway", () => {
  test("holds no message unless it is given some", async () => {
    expect(await new FakeMessagesGateway().list()).toEqual([]);
  });

  test("gives the ids message-1, message-2… to the messages it adds", async () => {
    const gateway = new FakeMessagesGateway();
    await gateway.add("Hello");
    await gateway.add("Bye");
    expect(await gateway.list()).toStrictEqual([new Message("message-1", "Hello"), new Message("message-2", "Bye")]);
  });

  test("fails to list with the message it is given", async () => {
    const gateway = new FakeMessagesGateway();
    gateway.failWith("HTTP 503");
    await expect(gateway.list()).rejects.toThrow("HTTP 503");
  });

  test("the messages it lists are a copy", async () => {
    const gateway = new FakeMessagesGateway([new Message("m1", "Hello")]);
    (await gateway.list()).pop();
    expect(await gateway.list()).toHaveLength(1);
  });
});
