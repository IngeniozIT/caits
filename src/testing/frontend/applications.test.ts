import { describe, expect, test } from "vitest";
import { GreetingsGateway } from "../../../test/project/frontend/greetings/domain/port/greetings-gateway/GreetingsGateway.js";
import { createTestApplication } from "./applications.js";

describe("the application of the frontend tests", () => {
  test("reads and replaces a dependency of a context that has no test.di.ts", () => {
    const app = createTestApplication();
    const gateway = { list: () => Promise.resolve(["Bonjour"]) };

    expect(app.use(GreetingsGateway, gateway)).toBe(gateway);
    expect(app.get(GreetingsGateway)).toBe(gateway);
  });

  test("refuses an input that no handler takes, as the message bus does", () => {
    expect(() => createTestApplication().send(new (class Unknown {})())).toThrow(
      "No handler takes Unknown: write one next to its DTO, in <use-case>.handler.ts, with execute(input: Unknown)"
    );
  });
});
