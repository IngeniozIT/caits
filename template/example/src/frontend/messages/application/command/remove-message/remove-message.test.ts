import { applicationScenario, describe, expect, test } from "@ingeniozit/caits/testing/frontend/application";
import { MessagesChanged } from "#context/application/event/MessagesChanged.js";
import { MessagesChangeFailed } from "#context/application/event/MessagesChangeFailed.js";
import { Message } from "#context/domain/entity/Message.js";
import { MessagesGateway } from "#context/domain/port/messages-gateway/MessagesGateway.js";
import { FakeMessagesGateway } from "#context/infra/messages-gateway/fake-messages-gateway.js";
import { RemoveMessageCommand } from "./remove-message.dto.js";

describe("remove message", () => {
  test("removes the message through the gateway, then announces the change", async ({ app }) => {
    const gateway = app.use(MessagesGateway, new FakeMessagesGateway([new Message("m1", "Hello"), new Message("m2", "Bye")]));

    await applicationScenario(app)
      .givenTheDto(new RemoveMessageCommand("m1"))
      .expectItToPublish(new MessagesChanged());

    expect(await gateway.list()).toStrictEqual([new Message("m2", "Bye")]);
  });

  test("a refusal of the server is announced with its reason", async ({ app }) => {
    app.use(MessagesGateway, new FakeMessagesGateway([new Message("m1", "Hello")])).refuseWith("HTTP 500");

    await applicationScenario(app)
      .givenTheDto(new RemoveMessageCommand("m1"))
      .expectItToPublish(new MessagesChangeFailed("removal", "HTTP 500"));
  });
});
