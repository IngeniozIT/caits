import { applicationScenario, describe, expect, test, type TestApplication } from "@ingeniozit/caits/testing/backend/application";
import { Message } from "#context/domain/entity/Message.js";
import { InvalidMessageError } from "#context/domain/error/InvalidMessageError.js";
import { MessageNotFoundError } from "#context/domain/error/MessageNotFoundError.js";
import { MessageRepository } from "#context/domain/port/message-repository/MessageRepository.js";
import { EditMessageCommand, EditMessageOutput } from "./edit-message.dto.js";

const kept = async (app: TestApplication) => (await app.get(MessageRepository).list()).map(({ id, text }) => [id, text]);
const twoMessages = async (app: TestApplication) => {
  await app.get(MessageRepository).save(Message.create("m1", "first"));
  await app.get(MessageRepository).save(Message.create("m2", "second"));
};

describe("edit message", () => {
  test("changes the text of the message: the message keeps its id and its place", async ({ app }) => {
    await twoMessages(app);

    await applicationScenario(app)
      .givenTheDto(new EditMessageCommand("m1", "  first, edited "))
      .expectTheOutputToBe(new EditMessageOutput("m1", "first, edited"));

    expect(await kept(app)).toEqual([["m1", "first, edited"], ["m2", "second"]]);
  });

  test("the domain refuses an empty text, and the message keeps its text", async ({ app }) => {
    await twoMessages(app);

    await applicationScenario(app)
      .givenTheDto(new EditMessageCommand("m1", " "))
      .expectTheErrorToBe(new InvalidMessageError("A message cannot be empty."));

    expect(await kept(app)).toEqual([["m1", "first"], ["m2", "second"]]);
  });

  test("refuses a message that does not exist", async ({ app }) => {
    await applicationScenario(app)
      .givenTheDto(new EditMessageCommand("unknown", "text"))
      .expectTheErrorToBe(new MessageNotFoundError("unknown"));

    expect(new MessageNotFoundError("unknown")).toMatchObject({ name: "MessageNotFoundError", message: "There is no message with the id unknown." });
  });
});
