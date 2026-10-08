import { applicationScenario, describe, expect, test } from "@ingeniozit/caits/testing/frontend/application";
import { MessagesChanged } from "#context/application/event/MessagesChanged.js";
import { MessagesChangeFailed } from "#context/application/event/MessagesChangeFailed.js";
import { Message } from "#context/domain/entity/Message.js";
import { MessagesGateway } from "#context/domain/port/messages-gateway/MessagesGateway.js";
import { FakeMessagesGateway } from "#context/infra/messages-gateway/fake-messages-gateway.js";
import { EditMessageCommand } from "./edit-message.dto.js";

describe("edit message", () => {
  test("gives the message its new text through the gateway, then announces the change", async ({ app }) => {
    const gateway = app.use(MessagesGateway, new FakeMessagesGateway([new Message("m1", "Hello")]));

    await applicationScenario(app)
      .givenTheDto(new EditMessageCommand("m1", "Hello again"))
      .expectItToPublish(new MessagesChanged());

    expect(await gateway.list()).toStrictEqual([new Message("m1", "Hello again")]);
  });

  test("a refusal of the server is announced with its reason", async ({ app }) => {
    app.use(MessagesGateway, new FakeMessagesGateway([new Message("m1", "Hello")])).refuseWith("A message cannot be empty.");

    await applicationScenario(app)
      .givenTheDto(new EditMessageCommand("m1", " "))
      .expectItToPublish(new MessagesChangeFailed("edition", "A message cannot be empty."));
  });
});
