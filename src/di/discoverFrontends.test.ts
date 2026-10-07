import { describe, expect, test } from "vitest";
import { Input } from "../messaging/Input.js";
import { Token } from "../Token.js";
import { discoverFrontends } from "./discoverFrontends.js";

class AddCommand extends Input<void> {}
class AddedNote {}
class AddHandler {}
class ListQuery extends Input<void> {}
class ListHandler {}
const notesStore = { initialState: {}, reduce: () => ({}), send: () => undefined };
const otherStore = { ...notesStore };
const bindings = [{ key: new Token("gateway"), value: "gateway" }];

const root = "../../frontend";
const nothing = { bindings: {}, dtos: {}, handlers: {}, stores: {} };
const notes = { bindings: { [`${root}/notes/di.ts`]: bindings }, stores: { [`${root}/notes/presentation/store/notesStore.ts`]: notesStore } };

describe("discovering the frontend", () => {
  test("a context has its di.ts and its store, and a handler serves the input DTO of its use-case folder; what is not a class is left aside", () => {
    const found = discoverFrontends({
      ...notes,
      dtos: {
        [`${root}/notes/application/command/add/add.dto.ts`]: { AddCommand, AddedNote, MAX_LENGTH: 280 },
        [`${root}/notes/application/query/list/list.dto.ts`]: { ListQuery }
      },
      handlers: {
        [`${root}/notes/application/command/add/add.handler.ts`]: { AddHandler, retries: 2 },
        [`${root}/notes/application/query/list/list.handler.ts`]: { ListHandler }
      }
    });
    expect(found).toEqual({ notes: { bindings, store: notesStore, useCases: [{ input: AddCommand, handler: AddHandler }, { input: ListQuery, handler: ListHandler }] } });
    expect(found.notes.store).toBe(notesStore);
  });

  test("each context takes the store of its own folder", () => {
    const found = discoverFrontends({
      ...nothing,
      bindings: { [`${root}/notes/di.ts`]: [], [`${root}/alerts/di.ts`]: [] },
      stores: { [`${root}/notes/presentation/store/notesStore.ts`]: notesStore, [`${root}/alerts/presentation/store/alertsStore.ts`]: otherStore }
    });
    expect(found.notes.store).toBe(notesStore);
    expect(found.alerts.store).toBe(otherStore);
  });

  test("a folder without a di.ts is not a frontend context", () => {
    expect(discoverFrontends(nothing)).toEqual({});
  });

  test.for([
    ["no store", {}],
    ["two stores", { [`${root}/notes/presentation/store/aStore.ts`]: notesStore, [`${root}/notes/presentation/store/bStore.ts`]: otherStore }]
  ] as const)("a context with %s is refused", ([, stores]) => {
    expect(() => discoverFrontends({ ...nothing, bindings: notes.bindings, stores })).toThrow(/the frontend notes declares one store in presentation\/store\/ \(found [02]\)/);
  });

  test("a handler of a folder without a di.ts is refused", () => {
    expect(() => discoverFrontends({ ...nothing, handlers: { [`${root}/ghost/application/query/list/list.handler.ts`]: { ListHandler } } }))
      .toThrow(`${root}/ghost/application/query/list/list.handler.ts belongs to a frontend without a di.ts`);
  });

  test("a handler needs the input DTO of its folder, and a single class", () => {
    const handler = `${root}/notes/application/query/list/list.handler.ts`;
    expect(() => discoverFrontends({ ...nothing, ...notes, handlers: { [handler]: { ListHandler } } }))
      .toThrow(`${root}/notes/application/query/list/list.dto.ts declares one input DTO (found 0)`);
    expect(() => discoverFrontends({ ...nothing, ...notes, dtos: { [handler.replace(".handler.ts", ".dto.ts")]: { ListQuery } }, handlers: { [handler]: { ListHandler, AddHandler } } }))
      .toThrow(`${handler} declares one handler (found 2)`);
  });
});
