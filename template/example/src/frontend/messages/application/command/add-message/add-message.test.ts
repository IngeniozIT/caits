import { applicationScenario, describe, expect, test } from "@ingeniozit/caits/testing/frontend/application";
import { MessagesChanged } from "#context/application/event/MessagesChanged.js";
import { MessagesChangeFailed } from "#context/application/event/MessagesChangeFailed.js";
import { Message } from "#context/domain/entity/Message.js";
import { MessagesGateway } from "#context/domain/port/messages-gateway/MessagesGateway.js";
import { FakeMessagesGateway } from "#context/infra/messages-gateway/fake-messages-gateway.js";
import { AddMessageCommand } from "./add-message.dto.js";

describe("add message", () => {
  test("adds the message through the gateway, then announces the change", async ({ app }) => {
    const gateway = app.use(MessagesGateway, new FakeMessagesGateway());

    await applicationScenario(app)
      .givenTheDto(new AddMessageCommand("Hello"))
      .expectItToPublish(new MessagesChanged());

    expect(await gateway.list()).toStrictEqual([new Message("message-1", "Hello")]);
  });

  test("a refusal of the server is announced with its reason", async ({ app }) => {
    app.use(MessagesGateway, new FakeMessagesGateway()).refuseWith("A message cannot be empty.");

    await applicationScenario(app)
      .givenTheDto(new AddMessageCommand(" "))
      .expectItToPublish(new MessagesChangeFailed("addition", "A message cannot be empty."));
  });
});
