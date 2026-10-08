import { describe, presentationScenario, test } from "@ingeniozit/caits/testing/backend/presentation";
import { RemoveMessageCommand, RemoveMessageOutput } from "#context/application/command/remove-message/remove-message.dto.js";
import { MessageNotFoundError } from "#context/domain/error/MessageNotFoundError.js";

const problemHeaders = { "content-type": "application/problem+json" };

describe("removing a message over HTTP", () => {
  test("hands the id of the path to the application, and answers with no content", async ({ app }) => {
    await presentationScenario(app)
      .givenTheRequest("DELETE", "/api/messages/message%201")
      .expectItToSend(new RemoveMessageCommand("message 1"))
      .givenTheApplicationReplies(new RemoveMessageOutput("message 1"))
      .expectTheResponseToBe(204);
  });

  test("answers 404 for a message that does not exist", async ({ app }) => {
    await presentationScenario(app)
      .givenTheRequest("DELETE", "/api/messages/unknown")
      .expectItToSend(new RemoveMessageCommand("unknown"))
      .givenTheApplicationFails(new MessageNotFoundError("unknown"))
      .expectTheResponseToBe(404, { type: "urn:caits:problem:message-not-found", title: "Message not found", status: 404, detail: "There is no message with the id unknown." }, problemHeaders);
  });

  test("reports an unexpected failure as an internal error", async ({ app }) => {
    await presentationScenario(app)
      .givenTheRequest("DELETE", "/api/messages/m1")
      .expectItToSend(new RemoveMessageCommand("m1"))
      .givenTheApplicationFails(new Error("disk full"))
      .expectTheResponseToBe(500, { type: "urn:caits:problem:internal-server-error", title: "Internal server error", status: 500 }, problemHeaders);
  });
});
