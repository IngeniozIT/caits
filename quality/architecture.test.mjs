import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { checkArchitecture } from "./architecture.mjs";
import { rules } from "../template/caits/architecture.mjs";

/** The files of the tests exist only in memory: the root is a folder that holds nothing. */
const ROOT = join(import.meta.dirname, "project-in-memory");

/** A small project that respects every rule: a backend context, a frontend context, the context map and the routes. */
const project = {
  "src/backend/notes/di.ts": `import { bind } from "@ingeniozit/caits/di/Container";
import { NoteRepository } from "./domain/port/note-repository/NoteRepository.js";
import { InMemoryNoteRepository } from "./infra/note-repository/in-memory-note-repository.js";

export default [bind(NoteRepository).to(InMemoryNoteRepository)];
`,
  "src/backend/notes/domain/entity/Note.ts": `import { InvalidNoteError } from "#context/domain/error/InvalidNoteError.js";

export class Note {
  constructor(readonly text: string) {
    if (text === "") throw new InvalidNoteError();
  }
}
`,
  "src/backend/notes/domain/error/InvalidNoteError.ts": "export class InvalidNoteError extends Error {}\n",
  "src/backend/notes/domain/event/NoteAdded.ts": "export class NoteAdded {}\n",
  "src/backend/notes/domain/port/note-repository/NoteRepository.ts": `import { Token } from "@ingeniozit/caits/Token";
import type { Note } from "#context/domain/entity/Note.js";

export interface NoteRepository { add(note: Note): Promise<void> }

export const NoteRepository = new Token<NoteRepository>();
`,
  "src/backend/notes/domain/port/note-repository/NoteRepository.contract.ts": "export function describeNoteRepositoryContract(): void {}\n",
  "src/backend/notes/infra/note-repository/in-memory-note-repository.ts": `import type { NoteRepository } from "#context/domain/port/note-repository/NoteRepository.js";

export class InMemoryNoteRepository implements NoteRepository {
  async add(): Promise<void> {}
}
`,
  "src/backend/notes/infra/note-repository/in-memory-note-repository.test.ts": `import { describeNoteRepositoryContract } from "#context/domain/port/note-repository/NoteRepository.contract.js";

describeNoteRepositoryContract();
`,
  "src/backend/notes/application/command/add-note/add-note.dto.ts": "export class AddNoteCommand {}\nexport class AddNoteOutput {}\n",
  "src/backend/notes/application/command/add-note/add-note.handler.ts": `import type { NoteRepository } from "#context/domain/port/note-repository/NoteRepository.js";
import { AddNoteOutput } from "./add-note.dto.js";

export class AddNoteHandler {
  constructor(private notes: NoteRepository) {}

  execute(): AddNoteOutput { return new AddNoteOutput(); }
}
`,
  "src/backend/notes/presentation/add-note-http/add-note-http.controller.ts": `import { Controller } from "@ingeniozit/caits/messaging/Controller";
import { AddNoteCommand } from "#context/application/command/add-note/add-note.dto.js";

export class AddNoteHttpController extends Controller {
  toDto(): AddNoteCommand { return new AddNoteCommand(); }
}
`,
  "src/backend/context-map.ts": `import { AddNoteCommand } from "./notes/application/command/add-note/add-note.dto.js";
import { NoteAdded } from "./notes/domain/event/NoteAdded.js";

export default [[NoteAdded, () => [new AddNoteCommand()]]];
`,

  "src/frontend/notes/di.ts": `import { bind } from "@ingeniozit/caits/di/Container";
import { NotesGateway } from "./domain/port/notes-gateway/NotesGateway.js";
import { HttpNotesGateway } from "./infra/notes-gateway/http-notes-gateway.js";

export default [bind(NotesGateway).to(HttpNotesGateway)];
`,
  "src/frontend/notes/domain/port/notes-gateway/NotesGateway.ts": `import { Token } from "@ingeniozit/caits/Token";

export interface NotesGateway { list(): Promise<string[]> }

export const NotesGateway = new Token<NotesGateway>();
`,
  "src/frontend/notes/domain/port/notes-gateway/NotesGateway.contract.ts": "export function describeNotesGatewayContract(): void {}\n",
  "src/frontend/notes/infra/notes-gateway/http-notes-gateway.ts": `import type { NotesGateway } from "#context/domain/port/notes-gateway/NotesGateway.js";

export class HttpNotesGateway implements NotesGateway {
  async list(): Promise<string[]> { return []; }
}
`,
  "src/frontend/notes/infra/notes-gateway/http-notes-gateway.test.ts": `import { describeNotesGatewayContract } from "#context/domain/port/notes-gateway/NotesGateway.contract.js";

describeNotesGatewayContract();
`,
  "src/frontend/notes/application/event/NotesRequested.ts": `export class NotesRequested {
  readonly type = "notes.requested" as const;
}
`,
  "src/frontend/notes/application/query/list-notes/list-notes.dto.ts": "export class ListNotesQuery {}\n",
  "src/frontend/notes/application/query/list-notes/list-notes.handler.ts": `import type { NotesGateway } from "#context/domain/port/notes-gateway/NotesGateway.js";

export class ListNotesHandler {
  constructor(private notes: NotesGateway) {}
}
`,
  "src/frontend/notes/presentation/NotesFrontend.ts": "export type NotesFrontend = { events: object };\n",
  "src/frontend/notes/presentation/store/notesStore.ts": `import { ListNotesQuery } from "#context/application/query/list-notes/list-notes.dto.js";

export default { send: () => new ListNotesQuery() };
`,
  "src/frontend/notes/presentation/view/notes-block/NotesBlock.marko": `import { frontendOf } from "@ingeniozit/caits/di/frontend";
import { NotesRequested } from "#context/application/event/NotesRequested.js";
import "./NotesBlock.scss";

<button onClick() { frontendOf($global, "notes").events.publish(new NotesRequested()); }>Charger</button>
`,
  "src/frontend/notes/presentation/view/notes-block/NotesBlock.scss": ".notes-block { color: var(--ink); }\n",

  "src/routes/_frontend/style/app.scss": '@use "sass:math";\n@use "@fontsource-variable/geist";\n@use "theme";\n',
  "src/routes/_frontend/style/_theme.scss": ":root { --ink: #17153B; }\n",
  "src/routes/_frontend/style/_values.scss": "$narrow: 56rem;\n",
  "src/routes/_frontend/home-page.scss": '@use "values";\n\n.home-page { @media (max-width: values.$narrow) { display: grid; } }\n',
  "src/routes/_frontend/+layout.marko": 'import "./style/app.scss";\n\n<html><body><${input.content}/></body></html>\n',
  "src/routes/_frontend/+page.marko": `import NotesBlock from "#frontend/notes/presentation/view/notes-block/NotesBlock.marko";

<main><\${NotesBlock}/></main>
`,
  "src/routes/_backend/api/notes/+handler.ts": `import { controller } from "@ingeniozit/caits/di/backend";
import { AddNoteHttpController } from "#backend/notes/presentation/add-note-http/add-note-http.controller.js";

export const POST = () => controller(AddNoteHttpController);
`
};

/** The violations of the project with these files added or changed, as [rule, file]. */
const violationsWith = (files = {}) => checkArchitecture(ROOT, Object.entries({ ...project, ...files }).map(([path, text]) => ({ path, text })), rules)
  .violations.map(({ rule, file }) => [rule, file]);

const handler = "src/backend/notes/application/command/add-note/add-note.handler.ts";
const entity = "src/backend/notes/domain/entity/Note.ts";
const store = "src/frontend/notes/presentation/store/notesStore.ts";
const contextMap = "src/backend/context-map.ts";
const backendRoute = "src/routes/_backend/api/notes/+handler.ts";

/**
 * For each rule: what breaks it, and the files that do so. The project then breaks this rule in the first of these files, and no other
 * rule, unless `expected` lists all the violations.
 */
const cases = [
  { rule: "container-built-by-kernel", breaks: "a handler makes a Container", files: { [handler]: "export class AddNoteHandler { container = new Container(); execute() { return new AddNoteOutput(); } }\n" } },
  { rule: "controllers-built-by-kernel", breaks: "a route makes its controller", files: { [backendRoute]: "export const POST = () => new AddNoteHttpController();\n" } },

  { rule: "domain-shape", breaks: "a file of the domain is in no folder of a kind", files: { "src/backend/notes/domain/helpers.ts": "export const trim = (text: string) => text.trim();\n" } },
  { rule: "domain-file-exports-one-name", breaks: "an entity exports a constant too", files: { [entity]: "export class Note {}\nexport const MAX_LENGTH = 280;\n" } },
  { rule: "entity-is-class", breaks: "a value object is a type", files: { "src/backend/notes/domain/value-object/Text.ts": "export type Text = string;\n" } },
  { rule: "error-extends-error", breaks: "an error does not extend Error", files: { "src/backend/notes/domain/error/EmptyNoteError.ts": "export class EmptyNoteError {}\n" } },
  {
    rule: "port-folder-named-after-port", breaks: "a port is in a folder of another name",
    files: {
      "src/backend/notes/domain/port/time/Clock.ts": "export interface Clock { now(): Date }\n",
      "src/backend/notes/domain/port/time/Clock.contract.ts": "export function describeClockContract(): void {}\n",
      "src/backend/notes/infra/time/system-time.test.ts": 'import { describeClockContract } from "#context/domain/port/time/Clock.contract.js";\n'
    },
    expected: [
      ["port-folder-named-after-port", "src/backend/notes/domain/port/time/Clock.ts"],
      ["port-folder-named-after-port", "src/backend/notes/domain/port/time/Clock.contract.ts"],
      ["infra-folder-implements-port", "src/backend/notes/infra/time/system-time.test.ts"]
    ]
  },
  { rule: "port-has-contract", breaks: "a port has no contract", files: { "src/backend/notes/domain/port/clock/Clock.ts": "export interface Clock { now(): Date }\n" } },
  { rule: "contract-next-to-port", breaks: "a contract is out of the domain", files: { "test/support/Clock.contract.ts": "export function describeClockContract(): void {}\n" } },
  {
    rule: "contract-runs-in-adapter-test", breaks: "no test of an adapter runs a contract",
    files: {
      "src/backend/notes/domain/port/clock/Clock.contract.ts": "export function describeClockContract(): void {}\n",
      "src/backend/notes/domain/port/clock/Clock.ts": "export interface Clock { now(): Date }\n"
    }
  },
  { rule: "core-without-node", breaks: "an entity imports Node", files: { [entity]: 'import { randomUUID } from "node:crypto";\n\nexport class Note { readonly id = randomUUID(); }\n' } },
  { rule: "domain-uses-kernel-primitives", breaks: "an entity imports a bus of the kernel", files: { [entity]: 'import { FrontendEventBus } from "@ingeniozit/caits/messaging/FrontendEventBus";\n\nexport class Note { bus?: FrontendEventBus; }\n' } },
  { rule: "entity-without-port", breaks: "an entity imports a port", files: { [entity]: 'import type { NoteRepository } from "#context/domain/port/note-repository/NoteRepository.js";\n\nexport class Note { repository?: NoteRepository; }\n' } },

  { rule: "backend-application-shape", breaks: "a use case holds a helper", files: { "src/backend/notes/application/command/add-note/helpers.ts": "export const trim = (text: string) => text.trim();\n" } },
  { rule: "handler-answers-output", breaks: "a handler gives no Output DTO", files: { [handler]: "export class AddNoteHandler { execute(): void {} }\n" } },
  { rule: "frontend-application-shape", breaks: "the application holds a helper", files: { "src/frontend/notes/application/helpers.ts": "export const trim = (text: string) => text.trim();\n" } },
  {
    rule: "event-file-exports-its-event", breaks: "an event file exports a constant too",
    files: { "src/frontend/notes/application/event/NotesLoaded.ts": 'export class NotesLoaded { readonly type = "notes.loaded" as const; }\nexport const LIMIT = 10;\n' }
  },
  { rule: "event-type-names-context", breaks: "the type of an event is not its name", files: { "src/frontend/notes/application/event/NotesLoaded.ts": 'export class NotesLoaded { readonly type = "notes.load" as const; }\n' } },

  { rule: "backend-presentation-shape", breaks: "a controller folder holds a helper", files: { "src/backend/notes/presentation/add-note-http/helpers.ts": "export const trim = (text: string) => text.trim();\n" } },
  { rule: "controller-extends-controller", breaks: "a controller does not extend the Controller of the kernel", files: { "src/backend/notes/presentation/add-note-http/add-note-http.controller.ts": "export class AddNoteHttpController {}\n" } },
  { rule: "frontend-presentation-shape", breaks: "the presentation holds a helper out of a view", files: { "src/frontend/notes/presentation/helpers.ts": "export const trim = (text: string) => text.trim();\n" } },
  { rule: "zod-in-presentation", breaks: "an entity imports zod", files: { [entity]: 'import { z } from "zod";\n\nexport class Note { static readonly schema = z.string(); }\n' } },
  { rule: "marko-in-frontend-presentation", breaks: "a handler imports Marko", files: { [handler]: 'import "marko";\n\nexport class AddNoteHandler { execute() { return new AddNoteOutput(); } }\n' } },
  {
    rule: "dtos-sent-by-store", breaks: "a file of a view imports an input DTO",
    files: { "src/frontend/notes/presentation/view/notes-block/loadNotesBlock.ts": 'import { ListNotesQuery } from "#context/application/query/list-notes/list-notes.dto.js";\n\nexport const query = () => new ListNotesQuery();\n' }
  },
  { rule: "events-built-with-new", breaks: "a view makes an event as an object", files: { "src/frontend/notes/presentation/view/notes-block/loadNotesBlock.ts": 'export const requested = { type: "notes.requested" };\n' } },
  {
    rule: "views-take-own-frontend", breaks: "a view takes the frontend of another context",
    files: { "src/frontend/notes/presentation/view/notes-block/NotesBlock.marko": '<button onClick() { frontendOf($global, "alerts"); }>Charger</button>\n' }
  },

  { rule: "backend-infra-shape", breaks: "an adapter is not named after its port", files: { "src/backend/notes/infra/note-repository/memory.ts": "export class Memory implements NoteRepository {}\n" } },
  { rule: "infra-folder-implements-port", breaks: "a folder of the infra has no port", files: { "src/backend/notes/infra/clock/system-clock.ts": "export class SystemClock implements Clock {}\n" } },
  { rule: "adapter-implements-port", breaks: "an adapter does not implement its port", files: { "src/backend/notes/infra/note-repository/file-note-repository.ts": "export class FileNoteRepository {}\n" } },
  { rule: "adapter-test-runs-contract", breaks: "the test of an adapter does not run the contract", files: { "src/backend/notes/infra/note-repository/file-note-repository.test.ts": "test();\n" } },

  { rule: "di-holds-bindings", breaks: "a di.ts builds its dependency", files: { "src/backend/notes/di.ts": "export default [new InMemoryNoteRepository()];\n" } },
  { rule: "di-read-by-kernel", breaks: "a handler imports the di.ts", files: { [handler]: 'import "#context/di.js";\n\nexport class AddNoteHandler { execute() { return new AddNoteOutput(); } }\n' } },

  { rule: "sides-hold-contexts", breaks: "src/backend holds a helper", files: { "src/backend/helpers.ts": "export const trim = (text: string) => text.trim();\n" } },
  { rule: "context-content", breaks: "a context holds a helper out of its layers", files: { "src/backend/notes/helpers.ts": "export const trim = (text: string) => text.trim();\n" } },
  {
    rule: "context-has-di", breaks: "a context has no di.ts",
    files: { "src/backend/alerts/domain/event/AlertRaised.ts": "export class AlertRaised {}\n" },
    expected: [["context-has-di", "src/backend/alerts"]]
  },
  { rule: "imports-by-shortcut", breaks: "a handler imports by going up folders", files: { [handler]: 'import "../../../domain/entity/Note.js";\n\nexport class AddNoteHandler { execute() { return new AddNoteOutput(); } }\n' } },
  { rule: "contexts-isolated", breaks: "a context imports another context", files: { [handler]: 'import "#backend/alerts/domain/event/AlertRaised.js";\n\nexport class AddNoteHandler { execute() { return new AddNoteOutput(); } }\n' } },
  { rule: "sides-apart", breaks: "the frontend imports the backend", files: { [store]: 'import { AddNoteCommand } from "#backend/notes/application/command/add-note/add-note.dto.js";\n\nexport default { send: () => new AddNoteCommand() };\n' } },
  { rule: "layer-direction", breaks: "the domain imports the application", files: { [entity]: 'import { AddNoteCommand } from "#context/application/command/add-note/add-note.dto.js";\n\nexport class Note { command?: AddNoteCommand; }\n' } },
  { rule: "contexts-without-routes", breaks: "a handler imports the context map", files: { [handler]: 'import "#backend/context-map.js";\n\nexport class AddNoteHandler { execute() { return new AddNoteOutput(); } }\n' } },

  { rule: "context-map-reads-events-and-dtos", breaks: "the context map imports an entity", files: { [contextMap]: 'import { Note } from "./notes/domain/entity/Note.js";\n\nexport default [Note];\n' } },
  {
    rule: "context-map-without-routes", breaks: "the context map imports a route",
    files: { [contextMap]: 'import "../routes/_backend/api/notes/+handler.js";\n\nexport default [];\n' },
    expected: [["imports-by-shortcut", contextMap], ["context-map-without-routes", contextMap]]
  },

  { rule: "routes-folders", breaks: "a route is out of _frontend and _backend", files: { "src/routes/api/+handler.ts": "export const GET = () => null;\n" } },
  { rule: "frontend-routes-content", breaks: "the frontend routes hold a helper out of component/", files: { "src/routes/_frontend/helpers.ts": "export const trim = (text: string) => text.trim();\n" } },
  { rule: "backend-routes-content", breaks: "the backend routes hold a helper", files: { "src/routes/_backend/api/notes/helpers.ts": "export const trim = (text: string) => text.trim();\n" } },
  {
    rule: "routes-on-their-side", breaks: "a frontend route imports the backend",
    files: { "src/routes/_frontend/component/notes.ts": 'import "#backend/notes/presentation/add-note-http/add-note-http.controller.js";\n' }
  },
  { rule: "routes-through-presentation", breaks: "a route imports an input DTO", files: { [backendRoute]: 'import "#backend/notes/application/command/add-note/add-note.dto.js";\n' } },
  { rule: "routes-without-context-map", breaks: "a route imports the context map", files: { [backendRoute]: 'import "#backend/context-map.js";\n' } },
  { rule: "routes-take-no-frontend", breaks: "a page takes a frontend", files: { "src/routes/_frontend/+page.marko": '<button onClick() { frontendOf($global, "notes"); }>Charger</button>\n' } },

  { rule: "no-test-environment", breaks: "a handler imports a test.di.ts", files: { [handler]: 'import "#context/test.di.js";\n\nexport class AddNoteHandler { execute() { return new AddNoteOutput(); } }\n' } },
  {
    rule: "no-test-support", breaks: "a handler imports the test support of the kernel",
    files: { [handler]: 'import "@ingeniozit/caits/testing/backend/application";\n\nexport class AddNoteHandler { execute() { return new AddNoteOutput(); } }\n' }
  },
  {
    rule: "nothing-outside-src", breaks: "a handler imports a file of test/",
    files: { [handler]: 'import "../../../../../../test/support/notes.js";\n\nexport class AddNoteHandler { execute() { return new AddNoteOutput(); } }\n' },
    expected: [["imports-by-shortcut", handler], ["nothing-outside-src", handler]]
  }
];

describe("the architecture rules", () => {
  test("a small project of each kind of file breaks no rule", () => {
    expect(violationsWith()).toEqual([]);
  });

  test.for(cases)("$rule: $breaks", ({ rule, files, expected = [[rule, Object.keys(files)[0]]] }) => {
    expect(violationsWith(files)).toEqual(expected);
  });

  test("each rule has a case that breaks it", () => {
    expect(cases.map(({ rule }) => rule)).toEqual(rules.map(({ name }) => name));
  });
});

describe("the rules on the stylesheets", () => {
  const viewStylesheet = "src/frontend/notes/presentation/view/notes-block/NotesBlock.scss";
  const theme = "../../../../../routes/_frontend/style/theme";

  test.for([
    ["@use", `@use "${theme}";\n`],
    ["@forward", `@forward "${theme}";\n`],
    ["@import", `@import "reset", "${theme}";\n`]
  ])("a stylesheet that loads a file with %s follows the rules of the imports", ([, text]) => {
    expect(violationsWith({ [viewStylesheet]: text })).toEqual([["imports-by-shortcut", viewStylesheet], ["contexts-without-routes", viewStylesheet]]);
  });

  test("tells a stylesheet that goes up a folder to load the files of its folder: Sass has no shortcut", () => {
    const sources = Object.entries({ ...project, [viewStylesheet]: `@use "${theme}";\n` }).map(([path, text]) => ({ path, text }));
    const [violation] = checkArchitecture(ROOT, sources, rules).violations;
    expect(violation.message).toBe(`a stylesheet does not go up a folder: it loads the files of its folder, and a View reads the values of the theme as CSS variables (${theme})`);
  });

  test("a View that loads the values of the routes, by the load path of Sass, breaks contexts-without-routes", () => {
    expect(violationsWith({ [viewStylesheet]: '@use "values";\n' })).toEqual([["contexts-without-routes", viewStylesheet]]);
  });

  test("a stylesheet of the routes out of style/, and next to no page or layout, breaks frontend-routes-content", () => {
    const stylesheet = "src/routes/_frontend/messages/messages-page.scss";
    expect(violationsWith({ [stylesheet]: ".messages-page { color: red; }\n" })).toEqual([["frontend-routes-content", stylesheet]]);
  });
});
