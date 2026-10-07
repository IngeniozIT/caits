import { describe, expect, test } from "vitest";
import { Input } from "../messaging/Input.js";
import { Token } from "../Token.js";
import { discover } from "./discover.js";

class AddOutput {}
class AddCommand extends Input<AddOutput> {}
class AddHandler {}
class ListQuery extends Input<string[]> {}
class ListHandler {}
class AddForm {}
const rules = [{ event: class {}, inputs: () => [] }];

const nothing = { bindings: {}, dtos: {}, handlers: {}, controllers: {}, map: {} };
const root = "../../backend";

describe("discovering the backend", () => {
  test("a handler serves the input DTO of its use-case folder, in the context of the folder; what is not a class is left aside", () => {
    const found = discover({
      ...nothing,
      dtos: {
        [`${root}/notes/application/command/add/add.dto.ts`]: { AddCommand, AddOutput, MAX_LENGTH: 280 },
        [`${root}/notes/application/query/list/list.dto.ts`]: { ListQuery }
      },
      handlers: {
        [`${root}/notes/application/command/add/add.handler.ts`]: { AddHandler, retries: 2 },
        [`${root}/notes/application/query/list/list.handler.ts`]: { ListHandler }
      },
      controllers: { [`${root}/notes/presentation/add-form/add-form.controller.ts`]: { AddForm, path: "/notes" } }
    });
    expect(found.contexts).toEqual({
      notes: { bindings: [], useCases: [{ input: AddCommand, handler: AddHandler }, { input: ListQuery, handler: ListHandler }], controllers: [AddForm] }
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
    expect(discover(nothing)).toEqual({ shared: [], contexts: {}, map: [] });
  });

  test("brings the context map", () => {
    expect(discover({ ...nothing, map: { [`${root}/context-map.ts`]: rules } }).map).toBe(rules);
  });

  const dto = `${root}/notes/application/command/add/add.dto.ts`;
  test.for<{ scenario: string; dtos: Record<string, Record<string, unknown>> }>([
    { scenario: "has no DTO file", dtos: {} },
    { scenario: "has a DTO file with no input", dtos: { [dto]: { AddOutput } } },
    { scenario: "has a DTO file with two inputs", dtos: { [dto]: { AddCommand, ListQuery } } }
  ])("refuses a use case that $scenario", ({ dtos }) => {
    const handlers = { [`${root}/notes/application/command/add/add.handler.ts`]: { AddHandler } };
    expect(() => discover({ ...nothing, dtos, handlers })).toThrow(`${root}/notes/application/command/add/add.dto.ts declares one input DTO`);
  });

  test("refuses a handler file with two classes", () => {
    const dtos = { [`${root}/notes/application/command/add/add.dto.ts`]: { AddCommand } };
    const handlers = { [`${root}/notes/application/command/add/add.handler.ts`]: { AddHandler, ListHandler } };
    expect(() => discover({ ...nothing, dtos, handlers })).toThrow("add.handler.ts declares one handler (found 2)");
  });
});
