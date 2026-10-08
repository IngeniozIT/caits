import { applicationScenario, describe, test } from "@ingeniozit/caits/testing/backend/application";
import { Message } from "#context/domain/entity/Message.js";
import { MessageRepository } from "#context/domain/port/message-repository/MessageRepository.js";
import { ListMessagesOutput, ListMessagesQuery } from "./list-messages.dto.js";

describe("list messages", () => {
  test("answers with the messages, in the order they were added", async ({ app }) => {
    await app.get(MessageRepository).save(Message.create("m1", "first"));
    await app.get(MessageRepository).save(Message.create("m2", "second"));

    await applicationScenario(app)
      .givenTheDto(new ListMessagesQuery())
      .expectTheOutputToBe(new ListMessagesOutput([{ id: "m1", text: "first" }, { id: "m2", text: "second" }]));
  });

  test("answers with no message when there is none", async ({ app }) => {
    await applicationScenario(app)
      .givenTheDto(new ListMessagesQuery())
      .expectTheOutputToBe(new ListMessagesOutput([]));
  });
});
