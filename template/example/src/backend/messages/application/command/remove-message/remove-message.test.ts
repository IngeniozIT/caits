import { applicationScenario, describe, expect, test, type TestApplication } from "@ingeniozit/caits/testing/backend/application";
import { Message } from "#context/domain/entity/Message.js";
import { MessageNotFoundError } from "#context/domain/error/MessageNotFoundError.js";
import { MessageRepository } from "#context/domain/port/message-repository/MessageRepository.js";
import { RemoveMessageCommand, RemoveMessageOutput } from "./remove-message.dto.js";

const kept = async (app: TestApplication) => (await app.get(MessageRepository).list()).map(({ id, text }) => [id, text]);

describe("remove message", () => {
  test("removes the message, and only it", async ({ app }) => {
    await app.get(MessageRepository).save(Message.create("m1", "first"));
    await app.get(MessageRepository).save(Message.create("m2", "second"));

    await applicationScenario(app)
      .givenTheDto(new RemoveMessageCommand("m1"))
      .expectTheOutputToBe(new RemoveMessageOutput("m1"));

    expect(await kept(app)).toEqual([["m2", "second"]]);
  });

  test("refuses a message that does not exist", async ({ app }) => {
    await applicationScenario(app)
      .givenTheDto(new RemoveMessageCommand("unknown"))
      .expectTheErrorToBe(new MessageNotFoundError("unknown"));
  });
});
