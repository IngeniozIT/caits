import { describe, expect, test } from "vitest";
import { DataDirectory } from "./di/DataDirectory.js";
import { Fetcher } from "./di/Fetcher.js";
import { RequestContext } from "./di/RequestContext.js";
import { EventPublisher } from "./messaging/EventPublisher.js";
import { MessageBus } from "./messaging/MessageBus.js";
import { ReportError } from "./messaging/ReportError.js";
import { Token } from "./Token.js";

const Named = new Token<string>("named");
const Unnamed = new Token<string>();

describe("a token", () => {
  test("keeps the name it is given, or gets the name of its constant from the build", () => {
    expect(Named.name).toBe("named");
    expect(Unnamed.name).toBe("Unnamed");
  });

  test("the tokens that the kernel gives to the contexts get their names from the build too: the errors of the containers show them", () => {
    expect([DataDirectory, Fetcher, RequestContext, MessageBus, EventPublisher, ReportError].map(token => token.name))
      .toEqual(["DataDirectory", "Fetcher", "RequestContext", "MessageBus", "EventPublisher", "ReportError"]);
  });

  test("created anywhere else without a name, has an empty name", () => {
    expect(new Token<string>().name).toBe("");
  });
});
