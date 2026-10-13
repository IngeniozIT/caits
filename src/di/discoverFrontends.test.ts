import { describe, expect, test } from "vitest";
import { share, when } from "../messaging/FrontendContextMap.js";
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
const nothing = { bindings: {}, dtos: {}, handlers: {}, stores: {}, maps: {} };
const notes = { bindings: { [`${root}/notes/di.ts`]: bindings }, stores: { [`${root}/notes/presentation/store/notesStore.ts`]: notesStore } };

describe("discovering the frontend", () => {
  test("a context has its di.ts and its store, and a handler serves the input DTO of its use-case folder; what is not a class is left aside", () => {
    const found = discoverFrontends({
      ...nothing,
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
    expect(found).toEqual({ notes: { bindings, store: notesStore, map: [], useCases: [{ input: AddCommand, handler: AddHandler }, { input: ListQuery, handler: ListHandler }] } });
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

  test("a context without a use case may have no store: its views and its components publish events, and read no state", () => {
    expect(discoverFrontends({ ...nothing, bindings: notes.bindings })).toEqual({ notes: { bindings, store: undefined, map: [], useCases: [] } });
  });

  test("a context with two stores is refused", () => {
    const stores = { [`${root}/notes/presentation/store/aStore.ts`]: notesStore, [`${root}/notes/presentation/store/bStore.ts`]: otherStore };
    expect(() => discoverFrontends({ ...nothing, bindings: notes.bindings, stores })).toThrow("the frontend notes declares one store at most in presentation/store/ (found 2)");
  });

  test("a context with use cases and no store is refused: the store sends their input DTOs", () => {
    const handler = `${root}/notes/application/query/list/list.handler.ts`;
    expect(() => discoverFrontends({ ...nothing, bindings: notes.bindings, dtos: { [handler.replace(".handler.ts", ".dto.ts")]: { ListQuery } }, handlers: { [handler]: { ListHandler } } }))
      .toThrow("the frontend notes has use cases, but no store to send their input DTOs: it declares one in presentation/store/");
  });

  test("a context takes the context map of its folder: the events of shared that it hears, and those of its own that it shares", () => {
    const map = [when(AddedNote, () => []), share(AddedNote, () => [])];
    const found = discoverFrontends({ ...nothing, ...notes, maps: { [`${root}/notes/context-map.ts`]: map } });
    expect(found.notes.map).toBe(map);
  });

  const mapPath = `${root}/notes/context-map.ts`;
  test.for<[string, unknown, string]>([
    ["a single line", when(AddedNote, () => []), '{"shares":false} is not a list'],
    ["a text", ["Stryker was here"], '"Stryker was here" is not a line'],
    ["nothing", [undefined], "undefined is not a line"],
    ["a line without its event", [{ shares: false, events: () => [] }], '{"shares":false} is not a line'],
    ["a line that says neither that it hears nor that it shares", [{ event: AddedNote, events: () => [] }], "{} is not a line"],
    ["a line of the backend, which gives inputs", [{ shares: false, event: AddedNote, inputs: () => [] }], '{"shares":false} is not a line']
  ])("a context map that gives %s is refused when the frontend starts: the kernel would lose it without a word", ([, map, what]) => {
    expect(() => discoverFrontends({ ...nothing, ...notes, maps: { [mapPath]: map as never } }))
      .toThrow(`${mapPath} lists the lines of its context map, export default [when(…), share(…)], made with @ingenioz-it/caits/messaging/FrontendContextMap: ${what}`);
  });

  test("a context map of a folder without a di.ts is refused", () => {
    expect(() => discoverFrontends({ ...nothing, maps: { [`${root}/ghost/context-map.ts`]: [] } })).toThrow(`${root}/ghost/context-map.ts belongs to a frontend without a di.ts`);
  });

  test("the context shared has no context map: it hears no other context", () => {
    expect(() => discoverFrontends({ ...nothing, bindings: { [`${root}/shared/di.ts`]: [] }, maps: { [`${root}/shared/context-map.ts`]: [] } }))
      .toThrow(`the frontend context shared hears no other context: it has no context map (${root}/shared/context-map.ts)`);
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
