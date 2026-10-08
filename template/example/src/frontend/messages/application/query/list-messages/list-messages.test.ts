import { applicationScenario, describe, test } from "@ingeniozit/caits/testing/frontend/application";
import { MessagesLoaded } from "#context/application/event/MessagesLoaded.js";
import { MessagesLoadFailed } from "#context/application/event/MessagesLoadFailed.js";
import { Message } from "#context/domain/entity/Message.js";
import { MessagesGateway } from "#context/domain/port/messages-gateway/MessagesGateway.js";
import { FakeMessagesGateway } from "#context/infra/messages-gateway/fake-messages-gateway.js";
import { ListMessagesQuery } from "./list-messages.dto.js";

describe("list messages", () => {
  test("announces the messages that the gateway gives", async ({ app }) => {
    app.use(MessagesGateway, new FakeMessagesGateway([new Message("m1", "Hello")]));

    await applicationScenario(app)
      .givenTheDto(new ListMessagesQuery())
      .expectItToPublish(new MessagesLoaded([new Message("m1", "Hello")]));
  });

  test("a failure of the gateway is announced with its reason", async ({ app }) => {
    app.use(MessagesGateway, new FakeMessagesGateway()).failWith("HTTP 503");

    await applicationScenario(app)
      .givenTheDto(new ListMessagesQuery())
      .expectItToPublish(new MessagesLoadFailed("HTTP 503"));
  });
});
