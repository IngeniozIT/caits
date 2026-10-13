import { describe, expect, test } from "vitest";
import { eventsFor, share, when } from "./FrontendContextMap.js";

class NameGiven {
  readonly type = "shared.name-given" as const;
  constructor(readonly name: string) {}
}
class ThemeChosen {
  readonly type = "shared.theme-chosen" as const;
}
class GreetingAsked {
  readonly type = "greetings.asked" as const;
  constructor(readonly name: string) {}
}
class NameShown {
  readonly type = "greetings.name-shown" as const;
  constructor(readonly name: string) {}
}

describe("the context map of a frontend context", () => {
  test("turns an event of shared into the events of the context, line by line", () => {
    const map = [
      when(NameGiven, event => [new GreetingAsked(event.name)]),
      when(NameGiven, event => [new NameShown(event.name)])
    ];

    expect(eventsFor(map, new NameGiven("Ada"))).toStrictEqual([new GreetingAsked("Ada"), new NameShown("Ada")]);
  });

  test("an event that no line hears gives nothing", () => {
    expect(eventsFor([when(NameGiven, event => [new GreetingAsked(event.name)])], new ThemeChosen())).toStrictEqual([]);
  });

  test("a line may give no event, or several", () => {
    const map = [when(NameGiven, event => event.name === "" ? [] : [new GreetingAsked(event.name), new NameShown(event.name)])];

    expect(eventsFor(map, new NameGiven(""))).toStrictEqual([]);
    expect(eventsFor(map, new NameGiven("Ada"))).toStrictEqual([new GreetingAsked("Ada"), new NameShown("Ada")]);
  });

  test("a line that shares turns an event of the context into events of shared", () => {
    const map = [when(NameGiven, event => [new NameShown(event.name)]), share(GreetingAsked, event => [new NameGiven(event.name)])];

    expect(eventsFor(map, new GreetingAsked("Ada"))).toStrictEqual([new NameGiven("Ada")]);
    expect(eventsFor(map, new NameGiven("Ada"))).toStrictEqual([new NameShown("Ada")]);
  });

  test("a line says whether it hears shared or shares with it: the kernel reads the first on the shared bus, the second on the bus of the context", () => {
    expect(when(NameGiven, () => [])).toMatchObject({ shares: false, event: NameGiven });
    expect(share(GreetingAsked, () => [])).toMatchObject({ shares: true, event: GreetingAsked });
  });
});
