import { describe, expect, test } from "vitest";
import { GreetingsLoaded } from "../../../test/project/frontend/greetings/event/GreetingsLoaded.js";
import { GreetingsRequested } from "../../../test/project/frontend/greetings/event/GreetingsRequested.js";
import { ListGreetingsQuery } from "../../../test/project/frontend/greetings/query/list-greetings/list-greetings.dto.js";
import { GreetingsAsked } from "../../../test/project/frontend/shared/event/GreetingsAsked.js";
import { testPresentation } from "./frontends.js";

describe("testPresentation", () => {
  test("gives the store of the context: the DTOs that it sends go to sent, and the events of the bus to published", () => {
    const presentation = testPresentation("greetings");

    presentation.events.publish(new GreetingsRequested());
    presentation.events.publish(new GreetingsLoaded(["Hello"]));

    expect(presentation.sent).toStrictEqual([new ListGreetingsQuery()]);
    expect(presentation.published).toStrictEqual([new GreetingsRequested(), new GreetingsLoaded(["Hello"])]);
    expect(presentation.store.getState()).toEqual({ greetings: { status: "loaded", data: ["Hello"] } });
  });

  test("a context without a store has none: a test reads the events that its views and its components publish", () => {
    const presentation = testPresentation("shared");

    presentation.events.publish(new GreetingsAsked());

    expect(presentation.store).toBeUndefined();
    expect(presentation.published).toStrictEqual([new GreetingsAsked()]);
  });
});
