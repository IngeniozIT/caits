import { describe, presentationScenario, test } from "@ingeniozit/caits/testing/backend/presentation";
import { ListMessagesOutput, ListMessagesQuery } from "#context/application/query/list-messages/list-messages.dto.js";

describe("listing the messages over HTTP", () => {
  test("asks the application for the messages, and answers with them", async ({ app }) => {
    await presentationScenario(app)
      .givenTheRequest("GET", "/api/messages")
      .expectItToSend(new ListMessagesQuery())
      .givenTheApplicationReplies(new ListMessagesOutput([{ id: "m1", text: "Hello" }]))
      .expectTheResponseToBe(200, { messages: [{ id: "m1", text: "Hello" }] });
  });
});
