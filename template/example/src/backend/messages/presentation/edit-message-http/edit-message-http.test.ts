import { describe, presentationScenario, test } from "@ingeniozit/caits/testing/backend/presentation";
import { EditMessageCommand, EditMessageOutput } from "#context/application/command/edit-message/edit-message.dto.js";
import { InvalidMessageError } from "#context/domain/error/InvalidMessageError.js";
import { MessageNotFoundError } from "#context/domain/error/MessageNotFoundError.js";

const problemHeaders = { "content-type": "application/problem+json" };

describe("editing a message over HTTP", () => {
  test("hands the id of the path and the text to the application, and answers with the message", async ({ app }) => {
    await presentationScenario(app)
      .givenTheRequest("PUT", "/api/messages/message%201", { text: "Hello again" })
      .expectItToSend(new EditMessageCommand("message 1", "Hello again"))
      .givenTheApplicationReplies(new EditMessageOutput("message 1", "Hello again"))
      .expectTheResponseToBe(200, { id: "message 1", text: "Hello again" });
  });

  test.for([
    { scenario: "the text is not a string", requestBody: { text: 5 } },
    { scenario: "the body is null", requestBody: null }
  ])("refuses the request when $scenario, and tells why", async ({ requestBody }, { app }) => {
    await presentationScenario(app)
      .givenTheRequest("PUT", "/api/messages/m1", requestBody)
      .expectTheResponseToBe(422, {
        type: "urn:caits:problem:invalid-request-body",
        title: "Invalid request body",
        status: 422,
        detail: "Invalid body",
        issues: [{ path: ["text"], message: "The text must be a string." }]
      }, problemHeaders);
  });

  test("explains a text that the domain refuses", async ({ app }) => {
    await presentationScenario(app)
      .givenTheRequest("PUT", "/api/messages/m1", { text: " " })
      .expectItToSend(new EditMessageCommand("m1", " "))
      .givenTheApplicationFails(new InvalidMessageError("A message cannot be empty."))
      .expectTheResponseToBe(422, { type: "urn:caits:problem:invalid-message", title: "Invalid message", status: 422, detail: "A message cannot be empty." }, problemHeaders);
  });

  test("answers 404 for a message that does not exist", async ({ app }) => {
    await presentationScenario(app)
      .givenTheRequest("PUT", "/api/messages/unknown", { text: "Hello" })
      .expectItToSend(new EditMessageCommand("unknown", "Hello"))
      .givenTheApplicationFails(new MessageNotFoundError("unknown"))
      .expectTheResponseToBe(404, { type: "urn:caits:problem:message-not-found", title: "Message not found", status: 404, detail: "There is no message with the id unknown." }, problemHeaders);
  });

  test("reports an unexpected failure as an internal error", async ({ app }) => {
    await presentationScenario(app)
      .givenTheRequest("PUT", "/api/messages/m1", { text: "Hello" })
      .expectItToSend(new EditMessageCommand("m1", "Hello"))
      .givenTheApplicationFails(new Error("disk full"))
      .expectTheResponseToBe(500, { type: "urn:caits:problem:internal-server-error", title: "Internal server error", status: 500 }, problemHeaders);
  });
});
