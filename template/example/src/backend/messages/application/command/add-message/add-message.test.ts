import { applicationScenario, describe, expect, test, type TestApplication } from "@ingeniozit/caits/testing/backend/application";
import { Message } from "#context/domain/entity/Message.js";
import { InvalidMessageError } from "#context/domain/error/InvalidMessageError.js";
import { MessageRepository } from "#context/domain/port/message-repository/MessageRepository.js";
import { AddMessageCommand, AddMessageOutput } from "./add-message.dto.js";

const kept = async (app: TestApplication) => (await app.get(MessageRepository).list()).map(({ id, text }) => [id, text]);

describe("add message", () => {
  test("keeps the text without the spaces around it, under a new id, and answers with the message", async ({ app }) => {
    await applicationScenario(app)
      .givenTheDto(new AddMessageCommand("  Hello  "))
      .expectTheOutputToBe(new AddMessageOutput("message-1", "Hello"));

    expect(await kept(app)).toEqual([["message-1", "Hello"]]);
  });

  test("each message gets an id of its own", async ({ app }) => {
    await app.send(new AddMessageCommand("first"));

    await applicationScenario(app)
      .givenTheDto(new AddMessageCommand("second"))
      .expectTheOutputToBe(new AddMessageOutput("message-2", "second"));
  });

  test("a text of the maximum length is accepted", async ({ app }) => {
    const longest = "x".repeat(Message.MAX_LENGTH);

    await applicationScenario(app)
      .givenTheDto(new AddMessageCommand(longest))
      .expectTheOutputToBe(new AddMessageOutput("message-1", longest));
  });

  test.for([
    ["", "A message cannot be empty."],
    ["   ", "A message cannot be empty."],
    ["x".repeat(Message.MAX_LENGTH + 1), "A message has at most 280 characters."]
  ])("the domain refuses %j, and keeps nothing", async ([text, reason], { app }) => {
    await applicationScenario(app)
      .givenTheDto(new AddMessageCommand(text))
      .expectTheErrorToBe(new InvalidMessageError(reason));

    expect(await kept(app)).toEqual([]);
    expect(new InvalidMessageError(reason).name).toBe("InvalidMessageError");
  });
});
