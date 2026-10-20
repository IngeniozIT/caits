import { describe, expect, test } from "vitest";
import { share, when } from "../messaging/ContextMap.js";
import type { MessageBus } from "../messaging/MessageBus.js";
import { DomainEvent } from "../DomainEvent.js";
import { Token } from "../Token.js";
import { discover } from "./discover.js";

class AddOutput {}
class AddCommand {}
class AddHandler { execute(_command: AddCommand) { return new AddOutput(); } }
class ListQuery {}
class ListHandler { execute(_query: ListQuery) { return []; } }
class AddForm {}
class Added extends DomainEvent {}
const rules = [when(Added, () => []), share(Added, () => [])];

const nothing = { bindings: {}, handlers: {}, controllers: {}, maps: {} };
const root = "../../backend";

describe("discovering the backend", () => {
  test("a handler serves the input DTO that its execute takes, in the context of its folder; what is not a class is left aside", () => {
    const found = discover({
      ...nothing,
      handlers: {
        [`${root}/notes/command/add/add.handler.ts`]: { AddHandler, retries: 2 },
        [`${root}/notes/query/list/list.handler.ts`]: { ListHandler }
      },
      controllers: { [`${root}/notes/command/add/add.form.controller.ts`]: { AddForm, path: "/notes" } }
    });
    expect(found.contexts).toEqual({
      notes: { bindings: [], useCases: [{ input: AddCommand, handler: AddHandler }, { input: ListQuery, handler: ListHandler }], controllers: [AddForm], map: [] }
    });
  });

  test("the bindings of shared are those of every context, the others belong to their context", () => {
    const shared = [{ key: new Token("clock"), value: "clock" }];
    const notes = [{ key: new Token("notes"), value: "notes" }];
    const found = discover({ ...nothing, bindings: { [`${root}/shared/di.ts`]: shared, [`${root}/notes/di.ts`]: notes } });
    expect(found.shared).toBe(shared);
    expect(found.contexts.notes.bindings).toBe(notes);
  });

  test("without a shared context, nothing is shared", () => {
    expect(discover(nothing)).toEqual({ shared: [], contexts: {} });
  });

  test("each context brings its context map: the events of shared that it hears, and those of its own that it shares", () => {
    expect(discover({ ...nothing, maps: { [`${root}/notes/context-map.ts`]: rules } }).contexts.notes.map).toBe(rules);
  });

  const mapPath = `${root}/notes/context-map.ts`;
  test.for<[string, unknown, string]>([
    ["a single line", when(Added, () => []), '{"shares":false} is not a list'],
    ["no default export", undefined, "undefined is not a list"],
    ["a text", ["Stryker was here"], '"Stryker was here" is not a line'],
    ["nothing", [null], "null is not a line"],
    ["a line without its event", [{ shares: true, events: () => [] }], '{"shares":true} is not a line'],
    ["a line that hears and gives no inputs", [{ shares: false, event: Added, events: () => [] }], '{"shares":false} is not a line'],
    ["a line that shares and gives no events", [{ shares: true, event: Added, inputs: () => [] }], '{"shares":true} is not a line'],
    ["a line that says neither that it hears nor that it shares", [{ shares: "yes", event: Added, events: () => [] }], '{"shares":"yes"} is not a line']
  ])("a context map that gives %s is refused when the backend starts: the kernel would lose it without a word", ([, map, what]) => {
    expect(() => discover({ ...nothing, maps: { [mapPath]: map as never } }))
      .toThrow(`${mapPath} lists the lines of its context map, export default [when(…), share(…)], made with @ingenioz-it/caits/messaging/ContextMap: ${what}`);
  });

  test("the context shared has no context map: it hears no other context", () => {
    expect(() => discover({ ...nothing, maps: { [`${root}/shared/context-map.ts`]: rules } }))
      .toThrow(`the backend context shared hears no other context: it has no context map (${root}/shared/context-map.ts)`);
  });

  const path = `${root}/notes/command/add/add.handler.ts`;
  test.for<[string, new () => unknown]>([
    ["has no execute", class NoExecute {}],
    ["takes no parameter", class NoParameter { execute() { return 1; } }],
    ["takes a text", class TakesText { execute(_text: string) { return 1; } }],
    ["takes a port, whose value is a token", class TakesPort { execute(_bus: MessageBus) { return 1; } }]
  ])("refuses a handler that %s: its execute names no input DTO", ([, handler]) => {
    expect(() => discover({ ...nothing, handlers: { [path]: { handler } } }))
      .toThrow(`${path}: ${handler.name}.execute names no input DTO. Give its parameter the type of the input DTO, the class that the use case receives.`);
  });

  test("refuses a handler file with two classes", () => {
    expect(() => discover({ ...nothing, handlers: { [path]: { AddHandler, ListHandler } } })).toThrow("add.handler.ts declares one handler (found 2)");
  });
});
