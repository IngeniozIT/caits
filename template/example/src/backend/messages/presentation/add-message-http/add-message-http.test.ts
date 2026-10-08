import { describe, expect, presentationScenario, test } from "@ingeniozit/caits/testing/backend/presentation";
import { AddMessageCommand, AddMessageOutput } from "#context/application/command/add-message/add-message.dto.js";
import { InvalidMessageError } from "#context/domain/error/InvalidMessageError.js";

const problemHeaders = { "content-type": "application/problem+json" };

describe("adding a message over HTTP", () => {
  test("hands the text to the application, and answers with the message it added", async ({ app }) => {
    await presentationScenario(app)
      .givenTheRequest("POST", "/api/messages", { text: "Hello" })
      .expectItToSend(new AddMessageCommand("Hello"))
      .givenTheApplicationReplies(new AddMessageOutput("m1", "Hello"))
      .expectTheResponseToBe(201, { id: "m1", text: "Hello" });
  });

  test("refuses a body that is not JSON", async ({ app }) => {
    await presentationScenario(app)
      .givenTheRequest("POST", "/api/messages", "{not json")
      .expectTheResponseToBe(400, { type: "urn:caits:problem:invalid-request-body", title: "Invalid request body", status: 400, detail: "Invalid JSON" }, problemHeaders);
  });

  test.for([
    { scenario: "the text is not a string", requestBody: { text: 5 } },
    { scenario: "the text is missing", requestBody: {} },
    { scenario: "the body is null", requestBody: null }
  ])("refuses the request when $scenario, and tells why", async ({ requestBody }, { app }) => {
    await presentationScenario(app)
      .givenTheRequest("POST", "/api/messages", requestBody)
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
      .givenTheRequest("POST", "/api/messages", { text: " " })
      .expectItToSend(new AddMessageCommand(" "))
      .givenTheApplicationFails(new InvalidMessageError("A message cannot be empty."))
      .expectTheResponseToBe(422, { type: "urn:caits:problem:invalid-message", title: "Invalid message", status: 422, detail: "A message cannot be empty." }, problemHeaders);
  });

  test("reports an unexpected failure, and tells nothing of it", async ({ app }) => {
    await presentationScenario(app)
      .givenTheRequest("POST", "/api/messages", { text: "Hello" })
      .expectItToSend(new AddMessageCommand("Hello"))
      .givenTheApplicationFails(new Error("disk full"))
      .expectTheResponseToBe(500, { type: "urn:caits:problem:internal-server-error", title: "Internal server error", status: 500 }, problemHeaders);

    expect(app.reportedErrors).toEqual([new Error("disk full")]);
  });
});
