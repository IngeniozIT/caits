import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { checkArchitecture } from "./architecture.mjs";
import { rules } from "../template/caits/architecture.mjs";

/** A component of the frontend context shared: a Marko tag, which the contexts place by its name. */
const BADGE = `import type { Label } from "#context/domain/value-object/Label.js";

export interface Input { label: Label }

<strong>\${input.label.text}</strong>
`;

/** A folder with these files on the disk, which the tests remove at their end. */
function folderWith(/** @type {Record<string, string>} */ files) {
  const folder = mkdtempSync(join(tmpdir(), "caits-architecture-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true });
    writeFileSync(join(folder, path), text);
  }
  return folder;
}

/**
 * The files of the tests exist in memory, but those that Marko reads on the disk to find its tags: the marko.json of the frontend,
 * and the components of the frontend context shared, which it gives.
 */
const ROOT = folderWith({
  "src/frontend/marko.json": '{ "tags-dir": "./shared/presentation/component" }\n',
  "src/frontend/shared/presentation/component/badge/index.marko": BADGE
});
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

/** A small project that respects every rule: a backend context, a frontend context, the context map and the routes. */
const project = {
  "src/backend/notes/di.ts": `import { bind } from "@ingenioz-it/caits/di/Container";
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
  "src/backend/notes/domain/port/note-repository/NoteRepository.ts": `import { Token } from "@ingenioz-it/caits/Token";
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
  "src/backend/notes/command/add-note/add-note.dto.ts": "export class AddNoteCommand {}\nexport class AddNoteOutput {}\n",
  "src/backend/notes/command/add-note/add-note.handler.ts": `import type { NoteRepository } from "#context/domain/port/note-repository/NoteRepository.js";
import { AddNoteOutput } from "./add-note.dto.js";

export class AddNoteHandler {
  constructor(private notes: NoteRepository) {}

  execute(): AddNoteOutput { return new AddNoteOutput(); }
}
`,
  "src/backend/notes/command/add-note/add-note.http.controller.ts": `import { Controller } from "@ingenioz-it/caits/messaging/Controller";
import { AddNoteCommand } from "./add-note.dto.js";

export class AddNoteHttpController extends Controller {
  toDto(): AddNoteCommand { return new AddNoteCommand(); }
}
`,
  "src/backend/shared/di.ts": "export default [];\n",
  "src/backend/shared/domain/event/UserJoined.ts": "export class UserJoined {}\n",
  "src/backend/shared/domain/event/NotePosted.ts": "export class NotePosted {}\n",
  "src/backend/notes/context-map.ts": `import { share, when } from "@ingenioz-it/caits/messaging/ContextMap";
import { AddNoteCommand } from "#context/command/add-note/add-note.dto.js";
import { NoteAdded } from "#context/domain/event/NoteAdded.js";
import { NotePosted } from "#shared/domain/event/NotePosted.js";
import { UserJoined } from "#shared/domain/event/UserJoined.js";

export default [when(UserJoined, () => [new AddNoteCommand()]), share(NoteAdded, () => [new NotePosted()])];
`,

  "src/frontend/notes/di.ts": `import { bind } from "@ingenioz-it/caits/di/Container";
import { NotesGateway } from "./domain/port/notes-gateway/NotesGateway.js";
import { HttpNotesGateway } from "./infra/notes-gateway/http-notes-gateway.js";

export default [bind(NotesGateway).to(HttpNotesGateway)];
`,
  "src/frontend/notes/domain/port/notes-gateway/NotesGateway.ts": `import { Token } from "@ingenioz-it/caits/Token";

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
  "src/frontend/notes/event/NotesRequested.ts": `export class NotesRequested {
  readonly type = "notes.requested" as const;
}
`,
  "src/frontend/notes/query/list-notes/list-notes.dto.ts": "export class ListNotesQuery {}\n",
  "src/frontend/notes/query/list-notes/list-notes.handler.ts": `import type { NotesGateway } from "#context/domain/port/notes-gateway/NotesGateway.js";

export class ListNotesHandler {
  constructor(private notes: NotesGateway) {}
}
`,
  "src/frontend/notes/presentation/NotesFrontend.ts": "export type NotesFrontend = { events: object };\n",
  "src/frontend/notes/event/NoteLabelChosen.ts": `export class NoteLabelChosen {
  readonly type = "notes.label-chosen" as const;
}
`,
  "src/frontend/notes/presentation/store/notesStore.ts": `import { ListNotesQuery } from "#context/query/list-notes/list-notes.dto.js";

export default { send: () => new ListNotesQuery() };
`,
  "src/frontend/notes/presentation/view/notes-block/NotesBlock.marko": `import { frontendOf } from "@ingenioz-it/caits/di/frontend";
import { NotesRequested } from "#context/event/NotesRequested.js";
import "./NotesBlock.scss";

<button onClick() { frontendOf($global, "notes").events.publish(new NotesRequested()); }>Charger</button>
`,
  "src/frontend/notes/presentation/view/notes-block/NotesBlock.scss": ".notes-block { color: var(--ink); }\n",
  "src/frontend/notes/presentation/view/notes-count/NotesCount.marko": 'import NoteLabel from "#context/presentation/component/note-label/NoteLabel.marko";\n\n<NoteLabel label=input.label/>\n',
  "src/frontend/notes/presentation/component/note-label/NoteLabel.marko": `import { frontendOf } from "@ingenioz-it/caits/di/frontend";
import { NoteLabelChosen } from "#context/event/NoteLabelChosen.js";
import type { Label } from "#frontend-shared/domain/value-object/Label.js";
import "./NoteLabel.scss";

export interface Input { label: Label }

<button onClick() { frontendOf($global, "notes").events.publish(new NoteLabelChosen()); }><badge label=input.label/></button>
`,
  "src/frontend/notes/presentation/component/note-label/NoteLabel.scss": ".note-label { color: var(--ink); }\n",
  "src/frontend/shared/di.ts": "export default [];\n",
  "src/frontend/shared/event/LabelChosen.ts": 'export class LabelChosen {\n  readonly type = "shared.label-chosen" as const;\n}\n',
  "src/frontend/notes/context-map.ts": `import { share, when } from "@ingenioz-it/caits/messaging/FrontendContextMap";
import { LabelChosen } from "#frontend-shared/event/LabelChosen.js";
import { NoteLabelChosen } from "#context/event/NoteLabelChosen.js";
import { NotesRequested } from "#context/event/NotesRequested.js";

export default [when(LabelChosen, () => [new NotesRequested()]), share(NoteLabelChosen, () => [new LabelChosen()])];
`,
  "src/frontend/shared/domain/value-object/Label.ts": "export class Label {\n  constructor(readonly text: string) {}\n}\n",
  "src/frontend/shared/domain/value-object/Label.test.ts": 'import { Label } from "./Label.js";\n\ntest(() => new Label("a"));\n',
  "src/frontend/shared/domain/error/EmptyLabelError.ts": "export class EmptyLabelError extends Error {}\n",
  "src/frontend/shared/presentation/component/badge/index.marko": BADGE,
  "src/frontend/notes/presentation/view/notes-feed/notesFeed.ts": 'export const notesFeed = () => new Response("<rss/>", { headers: { "content-type": "application/rss+xml" } });\n',

  "src/routes/_frontend/style/app.scss": '@use "sass:math";\n@use "@fontsource-variable/geist";\n@use "theme";\n',
  "src/routes/_frontend/style/_theme.scss": ":root { --ink: #17153B; }\n",
  "src/routes/_frontend/style/_values.scss": "$narrow: 56rem;\n",
  "src/routes/_frontend/home-page.scss": '@use "values";\n\n.home-page { @media (max-width: values.$narrow) { display: grid; } }\n',
  "src/routes/_frontend/+layout.marko": 'import "./style/app.scss";\n\n<html><body><${input.content}/></body></html>\n',
  "src/routes/_frontend/+page.marko": `import NotesBlock from "#frontend/notes/presentation/view/notes-block/NotesBlock.marko";

<main><\${NotesBlock}/></main>
`,
  "src/routes/_frontend/`notes.xml`/+handler.ts": 'export { notesFeed as GET } from "#frontend/notes/presentation/view/notes-feed/notesFeed.js";\n',
  "src/routes/_backend/api/notes/+handler.ts": `import { controller } from "@ingenioz-it/caits/di/backend";
import { AddNoteHttpController } from "#backend/notes/command/add-note/add-note.http.controller.js";

export const POST = () => controller(AddNoteHttpController);
`
};

/** The imports of the context map of notes, in the frontend. */
const FRONTEND_MAP_IMPORTS = `import { share, when } from "@ingenioz-it/caits/messaging/FrontendContextMap";
import { LabelChosen } from "#frontend-shared/event/LabelChosen.js";
import { NoteLabelChosen } from "#context/event/NoteLabelChosen.js";
import { NotesRequested } from "#context/event/NotesRequested.js";
`;

/** The violations of the project with these files added or changed, as [rule, file]. */
const violationsWith = (files = {}) => checkArchitecture(ROOT, Object.entries({ ...project, ...files }).map(([path, text]) => ({ path, text })), rules)
  .violations.map(({ rule, file }) => [rule, file]);

const handler = "src/backend/notes/command/add-note/add-note.handler.ts";
const entity = "src/backend/notes/domain/entity/Note.ts";
const store = "src/frontend/notes/presentation/store/notesStore.ts";
const contextMap = "src/backend/notes/context-map.ts";
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
  { rule: "domain-uses-kernel-primitives", breaks: "an entity imports a bus of the kernel", files: { [entity]: 'import { FrontendEventBus } from "@ingenioz-it/caits/messaging/FrontendEventBus";\n\nexport class Note { bus?: FrontendEventBus; }\n' } },
  { rule: "entity-without-port", breaks: "an entity imports a port", files: { [entity]: 'import type { NoteRepository } from "#context/domain/port/note-repository/NoteRepository.js";\n\nexport class Note { repository?: NoteRepository; }\n' } },

  { rule: "backend-use-case-shape", breaks: "a use case holds a helper", files: { "src/backend/notes/command/add-note/helpers.ts": "export const trim = (text: string) => text.trim();\n" } },
  { rule: "frontend-use-case-shape", breaks: "a use case of the frontend has a controller", files: { "src/frontend/notes/query/list-notes/list-notes.http.controller.ts": "export class ListNotesHttpController {}\n" } },
  {
    rule: "use-cases-isolated", breaks: "a controller sends the DTO of another use case",
    files: { "src/backend/notes/query/list-notes/list-notes.http.controller.ts": 'import { AddNoteCommand } from "#context/command/add-note/add-note.dto.js";\n\nexport class ListNotesHttpController extends Controller { toDto() { return new AddNoteCommand(); } }\n' }
  },
  { rule: "handler-answers-output", breaks: "a handler gives no Output DTO", files: { [handler]: "export class AddNoteHandler { execute(): void {} }\n" } },
  { rule: "controller-extends-controller", breaks: "a controller does not extend the Controller of the kernel", files: { "src/backend/notes/command/add-note/add-note.http.controller.ts": "export class AddNoteHttpController {}\n" } },
  { rule: "frontend-event-shape", breaks: "the events hold a folder", files: { "src/frontend/notes/event/loaded/NotesLoaded.ts": 'export class NotesLoaded { readonly type = "notes.loaded" as const; }\n' } },
  {
    rule: "event-file-exports-its-event", breaks: "an event file exports a constant too",
    files: { "src/frontend/notes/event/NotesLoaded.ts": 'export class NotesLoaded { readonly type = "notes.loaded" as const; }\nexport const LIMIT = 10;\n' }
  },
  { rule: "event-type-names-context", breaks: "the type of an event is not its name", files: { "src/frontend/notes/event/NotesLoaded.ts": 'export class NotesLoaded { readonly type = "notes.load" as const; }\n' } },

  { rule: "frontend-presentation-shape", breaks: "the presentation holds a helper out of a view", files: { "src/frontend/notes/presentation/helpers.ts": "export const trim = (text: string) => text.trim();\n" } },
  { rule: "zod-in-presentation", breaks: "an entity imports zod", files: { [entity]: 'import { z } from "zod";\n\nexport class Note { static readonly schema = z.string(); }\n' } },
  { rule: "marko-in-frontend-presentation", breaks: "a handler imports Marko", files: { [handler]: 'import "marko";\n\nexport class AddNoteHandler { execute() { return new AddNoteOutput(); } }\n' } },
  {
    rule: "dtos-sent-by-store", breaks: "a file of a view imports an input DTO",
    files: { "src/frontend/notes/presentation/view/notes-block/loadNotesBlock.ts": 'import { ListNotesQuery } from "#context/query/list-notes/list-notes.dto.js";\n\nexport const query = () => new ListNotesQuery();\n' }
  },
  { rule: "events-built-with-new", breaks: "a view makes an event as an object", files: { "src/frontend/notes/presentation/view/notes-block/loadNotesBlock.ts": 'export const requested = { type: "notes.requested" };\n' } },
  {
    rule: "views-take-own-frontend", breaks: "a view takes the frontend of another context",
    files: { "src/frontend/notes/presentation/view/notes-block/NotesBlock.marko": '<button onClick() { frontendOf($global, "alerts"); }>Charger</button>\n' }
  },
  {
    rule: "components-import-no-view", breaks: "a component imports a view",
    files: { "src/frontend/notes/presentation/component/note-label/NoteLabel.marko": 'import "#context/presentation/view/notes-block/NotesBlock.marko";\n\n<p>Notes</p>\n' }
  },
  {
    rule: "views-import-no-view", breaks: "a view imports another view",
    files: { "src/frontend/notes/presentation/view/notes-count/NotesCount.marko": 'import NotesBlock from "#context/presentation/view/notes-block/NotesBlock.marko";\n\n<NotesBlock/>\n' }
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
    rule: "context-map-translates-shared", breaks: "a context map imports a handler",
    files: { "src/frontend/notes/context-map.ts": 'import "#context/query/list-notes/list-notes.handler.js";\n\nexport default [];\n' }
  },
  {
    rule: "context-map-holds-lines", breaks: "a context map exports its lines under a name",
    files: { "src/frontend/notes/context-map.ts": 'import { when } from "@ingenioz-it/caits/messaging/FrontendContextMap";\nimport { LabelChosen } from "#frontend-shared/event/LabelChosen.js";\nimport { NotesRequested } from "#context/event/NotesRequested.js";\n\nexport const lines = [when(LabelChosen, () => [new NotesRequested()])];\n' }
  },
  {
    rule: "context-map-line-direction", breaks: "a line hears an event of its own context",
    files: { "src/frontend/notes/context-map.ts": `${FRONTEND_MAP_IMPORTS}\nexport default [when(NoteLabelChosen, () => [new NotesRequested()]), share(NoteLabelChosen, () => [new LabelChosen()])];\n` }
  },
  {
    rule: "context-maps-without-cycle", breaks: "a context hears an event of shared as the event that it shares as this event",
    files: { "src/frontend/notes/context-map.ts": `${FRONTEND_MAP_IMPORTS}\nexport default [when(LabelChosen, () => [new NoteLabelChosen()]), share(NoteLabelChosen, () => [new LabelChosen()])];\n` }
  },
  {
    rule: "shared-events-in-map", breaks: "a view publishes an event of shared",
    files: { "src/frontend/notes/presentation/view/notes-block/NotesBlock.marko": 'import { LabelChosen } from "#frontend-shared/event/LabelChosen.js";\n\n<button onClick() { frontendOf($global, "notes").events.publish(new LabelChosen()); }>Choisir</button>\n' }
  },
  { rule: "shared-hears-no-context", breaks: "the context shared has a context map", files: { "src/frontend/shared/context-map.ts": "export default [];\n" } },
  {
    rule: "context-has-di", breaks: "a context has no di.ts",
    files: { "src/backend/alerts/domain/event/AlertRaised.ts": "export class AlertRaised {}\n" },
    expected: [["context-has-di", "src/backend/alerts"]]
  },
  {
    rule: "shared-components-are-tags", breaks: "a component of the context shared has no index.marko",
    files: { "src/frontend/shared/presentation/component/chip/Chip.marko": "<span>Chip</span>\n" },
    expected: [["shared-components-are-tags", "src/frontend/shared/presentation/component/chip"]]
  },
  {
    rule: "shared-components-placed-by-tag", breaks: "a context imports the file of a component of shared",
    files: { "src/frontend/notes/presentation/view/notes-count/NotesCount.marko": 'import Badge from "#frontend-shared/presentation/component/badge/index.marko";\n\n<Badge label=input.label/>\n' }
  },
  { rule: "imports-by-shortcut", breaks: "a handler imports by going up folders", files: { [handler]: 'import "../../domain/entity/Note.js";\n\nexport class AddNoteHandler { execute() { return new AddNoteOutput(); } }\n' } },
  { rule: "contexts-isolated", breaks: "a context imports another context", files: { [handler]: 'import "#backend/alerts/domain/event/AlertRaised.js";\n\nexport class AddNoteHandler { execute() { return new AddNoteOutput(); } }\n' } },
  { rule: "tests-in-one-context", breaks: "the test of a use case imports another context", files: { "src/backend/notes/command/add-note/add-note.application.test.ts": 'import { RaiseCommand } from "#backend/alerts/command/raise/raise.dto.js";\n\ntest(() => new RaiseCommand());\n' } },
  { rule: "sides-apart", breaks: "the frontend imports the backend", files: { [store]: 'import { AddNoteCommand } from "#backend/notes/command/add-note/add-note.dto.js";\n\nexport default { send: () => new AddNoteCommand() };\n' } },
  { rule: "layer-direction", breaks: "the domain imports the application", files: { [entity]: 'import { AddNoteCommand } from "#context/command/add-note/add-note.dto.js";\n\nexport class Note { command?: AddNoteCommand; }\n' } },
  { rule: "contexts-without-routes", breaks: "a handler imports a route", files: { [handler]: 'import "/src/routes/_backend/api/notes/+handler.js";\n\nexport class AddNoteHandler { execute() { return new AddNoteOutput(); } }\n' } },

  { rule: "routes-folders", breaks: "a route is out of _frontend and _backend", files: { "src/routes/api/+handler.ts": "export const GET = () => null;\n" } },
  { rule: "frontend-routes-content", breaks: "the frontend routes hold a helper out of component/", files: { "src/routes/_frontend/helpers.ts": "export const trim = (text: string) => text.trim();\n" } },
  { rule: "backend-routes-content", breaks: "the backend routes hold a helper", files: { "src/routes/_backend/api/notes/helpers.ts": "export const trim = (text: string) => text.trim();\n" } },
  {
    rule: "routes-on-their-side", breaks: "a frontend route imports the backend",
    files: { "src/routes/_frontend/component/Notes.marko": 'import "#backend/notes/command/add-note/add-note.http.controller.js";\n\n<p>Notes</p>\n' }
  },
  { rule: "routes-through-presentation", breaks: "a route imports an input DTO", files: { [backendRoute]: 'import "#backend/notes/command/add-note/add-note.dto.js";\n' } },
  { rule: "routes-take-no-frontend", breaks: "a page takes a frontend", files: { "src/routes/_frontend/+page.marko": '<button onClick() { frontendOf($global, "notes"); }>Charger</button>\n' } },

  { rule: "no-test-environment", breaks: "a handler imports a test.di.ts", files: { [handler]: 'import "#context/test.di.js";\n\nexport class AddNoteHandler { execute() { return new AddNoteOutput(); } }\n' } },
  {
    rule: "no-test-support", breaks: "a handler imports the test support of the kernel",
    files: { [handler]: 'import "@ingenioz-it/caits/testing/backend/application";\n\nexport class AddNoteHandler { execute() { return new AddNoteOutput(); } }\n' }
  },
  {
    rule: "nothing-outside-src", breaks: "a handler imports a file of test/",
    files: { [handler]: 'import "../../../../../../test/support/notes.js";\n\nexport class AddNoteHandler { execute() { return new AddNoteOutput(); } }\n' },
    expected: [["imports-by-shortcut", handler], ["nothing-outside-src", handler]]
  },

  { rule: "exceptions-in-quality", breaks: "a comment turns off a rule of ESLint", files: { [handler]: "// eslint-disable-next-line @typescript-eslint/no-explicit-any\nexport class AddNoteHandler { execute() { return new AddNoteOutput(); } }\n" } }
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

describe("the exceptions", () => {
  const applicationTest = "src/backend/notes/command/add-note/add-note.application.test.ts";
  const view = "src/frontend/notes/presentation/view/notes-block/NotesBlock.marko";
  const withComment = (/** @type {string} */ comment) => `${comment}\nexport class AddNoteHandler { execute() { return new AddNoteOutput(); } }\n`;

  test.for([
    ["a rule of ESLint, for a line", "// eslint-disable-next-line no-console"],
    ["the rules of ESLint, for a file", "/* eslint-disable */"],
    ["a rule of ESLint, set in the file", "/* eslint no-console: off */"],
    ["an error of TypeScript", "// @ts-expect-error: the text is a number"],
    ["the types of a file", "// @ts-nocheck"],
    ["a line of the coverage", "/* v8 ignore next */"],
    ["a branch of the coverage, for istanbul", "/* istanbul ignore else */"],
    ["the mutants of a line", "// Stryker disable next-line all"]
  ])("a comment that turns off %s breaks exceptions-in-quality", ([, comment]) => {
    expect(violationsWith({ [handler]: withComment(comment) })).toEqual([["exceptions-in-quality", handler]]);
  });

  test("a comment that only names a tool is a comment", () => {
    expect(violationsWith({ [handler]: withComment("// eslint reads this file, and v8 runs it: Stryker mutates it") })).toEqual([]);
  });

  test("a test turns off no check either", () => {
    expect(violationsWith({ [applicationTest]: "/* v8 ignore start */\ntest(() => {});\n" })).toEqual([["exceptions-in-quality", applicationTest]]);
  });

  test("a template turns off no check: its script, and its own comments", () => {
    expect(violationsWith({ [view]: "<script>\n  // @ts-ignore\n  document.title = 1;\n</script>\n" })).toEqual([["exceptions-in-quality", view]]);
    expect(violationsWith({ [view]: "// @ts-nocheck\n<p>Notes</p>\n" })).toEqual([["exceptions-in-quality", view]]);
  });

  test.for([
    ["a skipped test", "test.skip(\"adds a note\", () => {});"],
    ["a test that runs alone", "describe.only(\"notes\", () => {});"],
    ["a test skipped on a condition", "test.skipIf(process.env.CI)(\"adds a note\", () => {});"],
    ["a test that may fail", "it.fails(\"adds a note\", () => {});"]
  ])("%s breaks exceptions-in-quality", ([, code]) => {
    expect(violationsWith({ [applicationTest]: `${code}\n` })).toEqual([["exceptions-in-quality", applicationTest]]);
  });

  test("a call named skip, out of the functions of the tests, is a call", () => {
    expect(violationsWith({ [applicationTest]: "test(() => { rows.skip(1); });\n" })).toEqual([]);
  });
});

describe("the tests", () => {
  const applicationTest = "src/backend/notes/command/add-note/add-note.application.test.ts";
  const viewTest = "src/frontend/notes/presentation/view/notes-block/NotesBlock.test.ts";
  const integrationTest = "src/backend/backend.integration.test.ts";

  test("a test of a context reads its context and the context shared of its side", () => {
    expect(violationsWith({ [applicationTest]: 'import { Note } from "#context/domain/entity/Note.js";\nimport { NotePosted } from "#shared/domain/event/NotePosted.js";\n\ntest(() => [Note, NotePosted]);\n' })).toEqual([]);
  });

  test("a test of a context that reads the context shared of the other side breaks tests-in-one-context", () => {
    expect(violationsWith({ [applicationTest]: 'import { LabelChosen } from "#frontend-shared/event/LabelChosen.js";\n\ntest(() => new LabelChosen());\n' })).toEqual([["tests-in-one-context", applicationTest]]);
  });

  test("a test of a view that builds the frontend of another context breaks tests-in-one-context", () => {
    expect(violationsWith({ [viewTest]: 'test(() => testPresentation("alerts"));\n' })).toEqual([["tests-in-one-context", viewTest]]);
    expect(violationsWith({ [viewTest]: 'test(() => testPresentation("notes"));\n' })).toEqual([]);
  });

  test("an integration test reads one context at most: two contexts break tests-in-one-context", () => {
    expect(violationsWith({ [integrationTest]: 'import { AddNoteCommand } from "./notes/command/add-note/add-note.dto.js";\nimport { NotePosted } from "#shared/domain/event/NotePosted.js";\n\ntest(() => [AddNoteCommand, NotePosted]);\n' })).toEqual([]);
    expect(violationsWith({ [integrationTest]: 'import { AddNoteCommand } from "./notes/command/add-note/add-note.dto.js";\nimport { RaiseCommand } from "./alerts/command/raise/raise.dto.js";\n\ntest(() => [AddNoteCommand, RaiseCommand]);\n' })).toEqual([["tests-in-one-context", integrationTest]]);
  });

  test("a test out of src/ reads one context at most, and the context shared of its side", () => {
    const endToEnd = "test/e2e/notes.spec.ts";
    expect(violationsWith({ [endToEnd]: 'import { Label } from "#frontend/notes/domain/value-object/Label.js";\n\ntest(() => Label);\n' })).toEqual([]);
    expect(violationsWith({ [endToEnd]: 'import { Label } from "#frontend/notes/domain/value-object/Label.js";\nimport { NotePosted } from "#shared/domain/event/NotePosted.js";\n\ntest(() => [Label, NotePosted]);\n' })).toEqual([["tests-in-one-context", endToEnd]]);
  });
});

describe("the use cases", () => {
  const useCase = "src/backend/notes/command/add-note";

  test("an endpoint lives in one folder: the DTOs, the handler and the controller of its use case, with their tests", () => {
    expect(violationsWith({
      [`${useCase}/add-note.application.test.ts`]: "test();\n",
      [`${useCase}/add-note.http.presentation.test.ts`]: "test();\n",
      [`${useCase}/add-note.form.controller.ts`]: 'import { Controller } from "@ingenioz-it/caits/messaging/Controller";\n\nexport class AddNoteFormController extends Controller {}\n'
    })).toEqual([]);
  });

  test.for([
    ["the test of the handler", "src/backend/notes/command/add-note/add-note.test.ts", "backend-use-case-shape"],
    ["the test of a controller", "src/backend/notes/command/add-note/add-note.http.test.ts", "backend-use-case-shape"],
    ["the test of a use case of the frontend", "src/frontend/notes/query/list-notes/list-notes.test.ts", "frontend-use-case-shape"]
  ])("the name of a test of a use case says the layer that it tests, application or presentation: %s", ([, file, rule]) => {
    expect(violationsWith({ [file]: "test();\n" })).toEqual([[rule, file]]);
  });

  test("the controller is of the presentation: the handler of its use case does not import it", () => {
    expect(violationsWith({ [handler]: 'import "./add-note.http.controller.js";\n\nexport class AddNoteHandler { execute() { return new AddNoteOutput(); } }\n' }))
      .toEqual([["layer-direction", handler]]);
  });

  test("a use case imports nothing from a use case of the context shared either", () => {
    expect(violationsWith({ [handler]: 'import "#shared/command/announce/announce.dto.js";\n\nexport class AddNoteHandler { execute() { return new AddNoteOutput(); } }\n' }))
      .toEqual([["use-cases-isolated", handler]]);
  });

  test.for([
    ["the use cases in application/", "src/backend/notes/application/command/add-note/add-note.handler.ts"],
    ["the controllers in presentation/", "src/backend/notes/presentation/add-note-http/add-note-http.controller.ts"],
    ["the use cases of the frontend in application/", "src/frontend/notes/application/query/list-notes/list-notes.handler.ts"],
    ["the events of the frontend in application/", "src/frontend/notes/application/event/NotesLoaded.ts"]
  ])("a context holds no layer folder but its domain, its infra, and, in the frontend, its events and its presentation: %s", ([, file]) => {
    expect(violationsWith({ [file]: "export class Moved {}\n" })).toEqual([["context-content", file]]);
  });

  test("an event of the frontend is in event/, not in a use case", () => {
    const event = "src/frontend/notes/query/list-notes/NotesLoaded.ts";
    expect(violationsWith({ [event]: 'export class NotesLoaded { readonly type = "notes.loaded" as const; }\n' })).toEqual([["frontend-use-case-shape", event]]);
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
    expect(violation.message).toBe(`a stylesheet does not go up a folder: it loads the files of its folder, and a view reads the values of the theme as CSS variables (${theme})`);
  });

  test("a View that loads the values of the routes, by the load path of Sass, breaks contexts-without-routes", () => {
    expect(violationsWith({ [viewStylesheet]: '@use "values";\n' })).toEqual([["contexts-without-routes", viewStylesheet]]);
  });

  test("a stylesheet of the routes out of style/, and next to no page or layout, breaks frontend-routes-content", () => {
    const stylesheet = "src/routes/_frontend/messages/messages-page.scss";
    expect(violationsWith({ [stylesheet]: ".messages-page { color: red; }\n" })).toEqual([["frontend-routes-content", stylesheet]]);
  });
});

describe("the routes of the documents", () => {
  test("a document at a path of its own, in a folder named after its file, gives a view and breaks no rule", () => {
    expect(violationsWith({ "src/routes/_frontend/blog/`rss.xml`/+handler.ts": 'export { notesFeed as GET } from "#frontend/notes/presentation/view/notes-feed/notesFeed.js";\n' })).toEqual([]);
  });

  test.for([
    ["a page of the frontend has a handler", "src/routes/_frontend/notes/+handler.ts"],
    ["the folder of a document names no file", "src/routes/_frontend/`notes`/+handler.ts"],
    ["a document is a flat route", "src/routes/_frontend/`sitemap.xml`+handler.ts"],
    ["a document is a file of its own", "src/routes/_frontend/`sitemap.xml`.ts"]
  ])("%s: it breaks frontend-routes-content", ([, path]) => {
    expect(violationsWith({ [path]: "export const GET = () => null;\n" })).toEqual([["frontend-routes-content", path]]);
  });
});

describe("the routes hold no logic and no test", () => {
  test.for([
    ["a module of TypeScript in component/", "src/routes/_frontend/component/notes.ts", "export const trim = (text: string) => text.trim();\n"],
    ["a test in component/", "src/routes/_frontend/component/Notes.test.ts", "test();\n"],
    ["a test next to a page", "src/routes/_frontend/notes/notes-page.test.ts", "test();\n"],
    ["a test of a document", "src/routes/_frontend/`notes.xml`/notes.test.ts", "test();\n"]
  ])("%s breaks frontend-routes-content", ([, path, text]) => {
    expect(violationsWith({ [path]: text })).toEqual([["frontend-routes-content", path]]);
  });

  test("a component of Marko in component/, and its stylesheet, break no rule", () => {
    expect(violationsWith({ "src/routes/_frontend/component/Logo.marko": "<svg/>\n", "src/routes/_frontend/component/Logo.scss": ".logo { width: 2rem; }\n" })).toEqual([]);
  });

  test("tells where the code that a test reads goes", () => {
    const sources = Object.entries({ ...project, "src/routes/_frontend/component/notes.ts": "export const trim = (text: string) => text.trim();\n" }).map(([path, text]) => ({ path, text }));
    const [violation] = checkArchitecture(ROOT, sources, rules).violations;
    expect(violation.message).toBe(
      "routes/_frontend holds +page.marko, +layout.marko, in component/ the components of Marko that only its pages use and their stylesheets, in style/ the stylesheets of the app, next to a page or a layout its stylesheet, and in a folder named after its file the route of a document (`sitemap.xml`/+handler.ts): the code that a test reads, and its test, live in a context"
    );
  });
});

describe("the components of the frontend", () => {
  const component = "src/frontend/notes/presentation/component/note-label/NoteLabel.marko";

  test("a component takes the frontend of its context, publishes its events and reads its store", () => {
    const imports = 'import { frontendOf } from "@ingenioz-it/caits/di/frontend";\nimport { NotesRequested } from "#context/event/NotesRequested.js";\nimport type { NotesState } from "#context/presentation/store/notesStore.js";\n';
    const markup = '<button onClick() { frontendOf($global, "notes").events.publish(new NotesRequested()); }>Notes</button>\n';
    expect(violationsWith({ [component]: `${imports}\n${markup}` })).toEqual([]);
  });

  test("a component that takes the frontend of another context breaks views-take-own-frontend", () => {
    expect(violationsWith({ [component]: '<button onClick() { frontendOf($global, "alerts"); }>Charger</button>\n' })).toEqual([["views-take-own-frontend", component]]);
  });

  test("a view imports the components of its context, and places those of the context shared by their tag", () => {
    const view = "src/frontend/notes/presentation/view/notes-count/NotesCount.marko";
    const imports = 'import NoteLabel from "#context/presentation/component/note-label/NoteLabel.marko";\n';
    expect(violationsWith({ [view]: `${imports}\n<NoteLabel label=input.label/><badge label=input.label/>\n` })).toEqual([]);
  });
});

describe("the events of shared in the frontend", () => {
  const view = "src/frontend/notes/presentation/view/notes-block/NotesBlock.marko";
  const labelChosen = 'import { LabelChosen } from "#frontend-shared/event/LabelChosen.js";\n';

  test("a context tells the other contexts through its context map: its views take no frontend of shared", () => {
    expect(violationsWith({ [view]: '<button onClick() { frontendOf($global, "shared"); }>Choisir</button>\n' })).toEqual([["views-take-own-frontend", view]]);
  });

  test("a component, the store, a handler and an adapter import no event of shared: the context map shares them, and hears them", () => {
    const component = "src/frontend/notes/presentation/component/note-label/NoteLabel.marko";
    const store = "src/frontend/notes/presentation/store/notesStore.ts";
    const frontendHandler = "src/frontend/notes/query/list-notes/list-notes.handler.ts";
    const adapter = "src/frontend/notes/infra/notes-gateway/http-notes-gateway.ts";
    expect(violationsWith({
      [component]: `${labelChosen}\n<p>Notes</p>\n`,
      [store]: `${labelChosen}\nexport default { share: () => new LabelChosen() };\n`,
      [frontendHandler]: `${labelChosen}\nexport class ListNotesHandler {}\n`,
      [adapter]: `${labelChosen}import type { NotesGateway } from "#context/domain/port/notes-gateway/NotesGateway.js";\n\nexport class HttpNotesGateway implements NotesGateway { async list() { return []; } }\n`
    })).toEqual([["shared-events-in-map", adapter], ["shared-events-in-map", frontendHandler], ["shared-events-in-map", store], ["shared-events-in-map", component]]);
  });

  test("the domain imports no event: only layer-direction says it", () => {
    const entity = "src/frontend/notes/domain/entity/Note.ts";
    expect(violationsWith({ [entity]: `${labelChosen}\nexport class Note {}\n` })).toEqual([["layer-direction", entity]]);
  });

  test("the test of a view may read the events of shared", () => {
    expect(violationsWith({ "src/frontend/notes/presentation/view/notes-block/NotesBlock.test.ts": `${labelChosen}\ntest(() => new LabelChosen());\n` })).toEqual([]);
  });

  test("the components of shared publish its events on its bus, the shared bus", () => {
    const badge = "src/frontend/shared/presentation/component/badge/index.marko";
    const imports = 'import { frontendOf } from "@ingenioz-it/caits/di/frontend";\nimport { LabelChosen } from "#context/event/LabelChosen.js";\n';
    expect(violationsWith({ [badge]: `${imports}\n<button onClick() { frontendOf($global, "shared").events.publish(new LabelChosen()); }>Choisir</button>\n` })).toEqual([]);
  });
});

describe("the events of shared in the backend", () => {
  const notePosted = 'import { NotePosted } from "#shared/domain/event/NotePosted.js";\n';

  test("a handler, an entity, a controller, an adapter and a di.ts import no event of shared: the context map shares them, and hears them", () => {
    const controller = "src/backend/notes/command/add-note/add-note.http.controller.ts";
    const adapter = "src/backend/notes/infra/note-repository/in-memory-note-repository.ts";
    const di = "src/backend/notes/di.ts";
    expect(violationsWith({
      [handler]: `${notePosted}import { AddNoteOutput } from "./add-note.dto.js";\n\nexport class AddNoteHandler { execute() { return new AddNoteOutput(); } }\n`,
      [entity]: `${notePosted}\nexport class Note {}\n`,
      [controller]: `${notePosted}import { Controller } from "@ingenioz-it/caits/messaging/Controller";\n\nexport class AddNoteHttpController extends Controller {}\n`,
      [adapter]: `${notePosted}import type { NoteRepository } from "#context/domain/port/note-repository/NoteRepository.js";\n\nexport class InMemoryNoteRepository implements NoteRepository { async add() {} }\n`,
      [di]: `${notePosted}\nexport default [];\n`
    })).toEqual([["shared-events-in-map", di], ["shared-events-in-map", entity], ["shared-events-in-map", adapter], ["shared-events-in-map", handler], ["shared-events-in-map", controller]]);
  });

  test("a handler publishes the events of its context, and the context map shares them", () => {
    const imports = 'import type { EventPublisher } from "@ingenioz-it/caits/messaging/EventPublisher";\nimport { NoteAdded } from "#context/domain/event/NoteAdded.js";\nimport { AddNoteOutput } from "./add-note.dto.js";\n';
    expect(violationsWith({ [handler]: `${imports}\nexport class AddNoteHandler {\n  constructor(private events: EventPublisher<NoteAdded>) {}\n\n  execute(): AddNoteOutput { this.events.publish(new NoteAdded()); return new AddNoteOutput(); }\n}\n` })).toEqual([]);
  });

  test("the test of a flow may read the events of shared", () => {
    expect(violationsWith({ "src/backend/notes/context-map.test.ts": `${notePosted}\ntest(() => new NotePosted());\n` })).toEqual([]);
  });

  test("the handlers of the context shared publish its events", () => {
    const announce = "src/backend/shared/command/announce/announce.handler.ts";
    const imports = 'import { NotePosted } from "#context/domain/event/NotePosted.js";\nimport { AnnounceOutput } from "./announce.dto.js";\n';
    expect(violationsWith({
      "src/backend/shared/command/announce/announce.dto.ts": "export class AnnounceCommand {}\nexport class AnnounceOutput {}\n",
      [announce]: `${imports}\nexport class AnnounceHandler { execute(): AnnounceOutput { void new NotePosted(); return new AnnounceOutput(); } }\n`
    })).toEqual([]);
  });
});

describe("the context maps of the frontend", () => {
  test("no layer imports the context map: the kernel reads it", () => {
    const view = "src/frontend/notes/presentation/view/notes-count/NotesCount.marko";
    expect(violationsWith({ [view]: 'import "#context/context-map.js";\n\n<p>Notes</p>\n' })).toEqual([["layer-direction", view]]);
  });

  test("a context map translates between the events of shared and those of its context: it imports no other context", () => {
    const map = "src/frontend/notes/context-map.ts";
    expect(violationsWith({ [map]: 'import "#frontend/alerts/event/AlertRaised.js";\n\nexport default [];\n' })).toEqual([["contexts-isolated", map]]);
  });

  test("a context map of the backend translates between the events of shared and those of its context: it imports neither a handler nor another context", () => {
    expect(violationsWith({ [contextMap]: `import "#context/command/add-note/add-note.handler.js";\n${project[contextMap]}` })).toEqual([["context-map-translates-shared", contextMap]]);
    expect(violationsWith({ [contextMap]: `import "#backend/alerts/command/raise/raise.dto.js";\n${project[contextMap]}` })).toEqual([["contexts-isolated", contextMap]]);
  });

  test("the backend has no context map of its whole: src/backend holds the contexts, and the integration tests of the whole backend", () => {
    expect(violationsWith({ "src/backend/context-map.ts": "export default [];\n" })).toEqual([["sides-hold-contexts", "src/backend/context-map.ts"]]);
    expect(violationsWith({ "src/backend/backend.integration.test.ts": "test();\n" })).toEqual([]);
  });

  test("the context shared of the backend has no context map either", () => {
    expect(violationsWith({ "src/backend/shared/context-map.ts": "export default [];\n" })).toEqual([["shared-hears-no-context", "src/backend/shared/context-map.ts"]]);
  });

  test("no layer of the backend imports the context map", () => {
    expect(violationsWith({ [handler]: 'import "#context/context-map.js";\n\nexport class AddNoteHandler { execute() { return new AddNoteOutput(); } }\n' })).toEqual([["layer-direction", handler]]);
  });
});

describe("the lines of the context maps", () => {
  const frontendMap = "src/frontend/notes/context-map.ts";
  const backendImports = `import { share, when } from "@ingenioz-it/caits/messaging/ContextMap";
import { AddNoteCommand } from "#context/command/add-note/add-note.dto.js";
import { NoteAdded } from "#context/domain/event/NoteAdded.js";
import { NotePosted } from "#shared/domain/event/NotePosted.js";
import { UserJoined } from "#shared/domain/event/UserJoined.js";
`;
  const backendMapOf = (/** @type {string} */ lines) => ({ [contextMap]: `${backendImports}\nexport default [${lines}];\n` });
  const messagesOf = (/** @type {Record<string, string>} */ files) => checkArchitecture(ROOT, Object.entries({ ...project, ...files }).map(([path, text]) => ({ path, text })), rules)
    .violations.map(({ rule, message }) => [rule, message]);

  test("a context map lists only its lines, made with the when and the share of the kernel for its side", () => {
    expect(messagesOf(backendMapOf("when(UserJoined, () => [new AddNoteCommand()]), share(NoteAdded, () => [new NotePosted()]), ...[]"))).toEqual([
      ["context-map-holds-lines", "a context map lists its lines, each made with when(Event, event => […]) or share(Event, event => […]): ...[]"]
    ]);
    const frontendLines = backendImports.replace("@ingenioz-it/caits/messaging/ContextMap", "@ingenioz-it/caits/messaging/FrontendContextMap");
    expect(messagesOf({ [contextMap]: `${frontendLines}\nexport default [when(UserJoined, () => [new AddNoteCommand()]), share(NoteAdded, () => [new NotePosted()])];\n` })).toEqual([
      ["context-map-holds-lines", "a context map of the backend takes share from @ingenioz-it/caits/messaging/ContextMap, not from @ingenioz-it/caits/messaging/FrontendContextMap"],
      ["context-map-holds-lines", "a context map of the backend takes when from @ingenioz-it/caits/messaging/ContextMap, not from @ingenioz-it/caits/messaging/FrontendContextMap"]
    ]);
  });

  test("a context map has one export", () => {
    expect(messagesOf({ [frontendMap]: `${FRONTEND_MAP_IMPORTS}\nexport const LINES = 2;\nexport default [when(LabelChosen, () => [new NotesRequested()]), share(NoteLabelChosen, () => [new LabelChosen()])];\n` })).toEqual([
      ["context-map-holds-lines", "a context map has one export, its lines: `export default [when(Event, event => […]), share(Event, event => […])]`"]
    ]);
  });

  test("in the backend, share starts from an event of the context and gives events of shared; when starts from an event of shared and gives inputs", () => {
    expect(messagesOf(backendMapOf("when(NoteAdded, () => [new AddNoteCommand()]), share(NotePosted, () => [new UserJoined()]), share(NoteAdded, () => [new AddNoteCommand()]), when(UserJoined, () => [new NotePosted()])"))).toEqual([
      ["context-map-line-direction", "when(NoteAdded, …) starts from an event of shared, which comes on the shared bus: NoteAdded is an event of its context, which share(…) shares"],
      ["context-map-line-direction", "share(NotePosted, …) starts from an event of its context, which a handler publishes: NotePosted is an event of shared, which when(…) hears"],
      ["context-map-line-direction", "share(…) gives events of shared: AddNoteCommand is not one"],
      ["context-map-line-direction", "when(…) gives input DTOs of its context: NotePosted is not one"]
    ]);
  });

  test("in the frontend, when gives the events of the context; a line may build the values of the domain that its events hold", () => {
    const imports = `${FRONTEND_MAP_IMPORTS}import { Label } from "#frontend-shared/domain/value-object/Label.js";\n`;
    expect(messagesOf({ [frontendMap]: `${imports}\nexport default [when(LabelChosen, () => [new LabelChosen(), new NotesRequested(new Label("a"))]), share(NoteLabelChosen, () => [new LabelChosen()])];\n` })).toEqual([
      ["context-map-line-direction", "when(…) gives events of its context: LabelChosen is not one"]
    ]);
  });

  test("a line whose event is neither of the context nor of shared starts from no event of its kind", () => {
    const imports = `${FRONTEND_MAP_IMPORTS}import { Label } from "#frontend-shared/domain/value-object/Label.js";\n`;
    expect(messagesOf({ [frontendMap]: `${imports}\nexport default [when(Label, () => []), share(Label, () => [])];\n` })).toEqual([
      ["context-map-line-direction", "when(Label, …) starts from an event of shared, which comes on the shared bus: Label is not one"],
      ["context-map-line-direction", "share(Label, …) starts from an event of its context, which a view publishes: Label is not one"]
    ]);
  });

  test("a context may hear the event of shared that it shares: only a cycle is refused, in one map or across several", () => {
    const alertsMap = "src/frontend/alerts/context-map.ts";
    const files = {
      "src/frontend/alerts/di.ts": "export default [];\n",
      "src/frontend/alerts/event/AlertShown.ts": 'export class AlertShown {\n  readonly type = "alerts.shown" as const;\n}\n',
      "src/frontend/shared/event/ThemeAsked.ts": 'export class ThemeAsked {\n  readonly type = "shared.theme-asked" as const;\n}\n',
      [alertsMap]: `import { share, when } from "@ingenioz-it/caits/messaging/FrontendContextMap";
import { AlertShown } from "#context/event/AlertShown.js";
import { LabelChosen } from "#frontend-shared/event/LabelChosen.js";
import { ThemeAsked } from "#frontend-shared/event/ThemeAsked.js";

export default [when(LabelChosen, () => [new AlertShown()]), share(AlertShown, () => [new ThemeAsked()])];
`
    };
    expect(messagesOf(files)).toEqual([]);

    const notes = `${FRONTEND_MAP_IMPORTS}import { ThemeAsked } from "#frontend-shared/event/ThemeAsked.js";\n\nexport default [when(ThemeAsked, () => [new NoteLabelChosen()]), share(NoteLabelChosen, () => [new LabelChosen()])];\n`;
    expect(violationsWith({ ...files, [frontendMap]: notes })).toEqual([["context-maps-without-cycle", alertsMap]]);
    expect(messagesOf({ ...files, [frontendMap]: notes })).toEqual([
      ["context-maps-without-cycle", "the context maps make a cycle, which the buses would carry without end: AlertShown → ThemeAsked → NoteLabelChosen → LabelChosen → AlertShown"]
    ]);
  });

  test("the backend shows no cycle: it goes through a handler", () => {
    expect(violationsWith(backendMapOf("when(UserJoined, () => [new AddNoteCommand()]), share(NoteAdded, () => [new NotePosted()]), share(NoteAdded, () => [new UserJoined()])"))).toEqual([]);
  });
});

describe("the context shared of the frontend", () => {
  test("its components need the marko.json of the frontend, which gives Marko the folder of their tags", () => {
    const bare = folderWith({});
    const sources = Object.entries(project).map(([path, text]) => ({ path, text }));
    const { violations } = checkArchitecture(bare, sources, rules);
    rmSync(bare, { recursive: true, force: true });

    expect(violations.map(({ rule, file, message }) => [rule, file, message])).toEqual([[
      "shared-components-are-tags",
      "src/frontend/marko.json",
      'the components of the frontend context shared are Marko tags: src/frontend/marko.json gives Marko their folder, { "tags-dir": "./shared/presentation/component" }'
    ]]);
  });

  test("a marko.json that gives another folder of tags is not enough", () => {
    const other = folderWith({ "src/frontend/marko.json": '{ "tags-dir": ["./tags"] }\n', "src/frontend/tags/keep": "" });
    const sources = Object.entries(project).map(([path, text]) => ({ path, text }));
    const { violations } = checkArchitecture(other, sources, rules);
    rmSync(other, { recursive: true, force: true });

    expect(violations.map(({ rule, file }) => [rule, file])).toEqual([["shared-components-are-tags", "src/frontend/marko.json"]]);
  });

  test("a marko.json that gives the folder of the components among others is enough", () => {
    const both = folderWith({
      "src/frontend/marko.json": '{ "tags-dir": ["./tags", "shared/presentation/component/"] }\n',
      "src/frontend/tags/keep": "",
      "src/frontend/shared/presentation/component/badge/index.marko": BADGE
    });
    const sources = Object.entries(project).map(([path, text]) => ({ path, text }));
    const { violations } = checkArchitecture(both, sources, rules);
    rmSync(both, { recursive: true, force: true });

    expect(violations).toEqual([]);
  });

  test("a project without components in shared needs no marko.json", () => {
    const bare = folderWith({});
    const sources = Object.entries(project).filter(([path]) => !path.startsWith("src/frontend/shared/presentation/")).map(([path, text]) => ({ path, text }));
    const withoutBadge = sources.map(source => source.path.endsWith("NoteLabel.marko") ? { ...source, text: "<span>Note</span>\n" } : source);
    const { violations } = checkArchitecture(bare, withoutBadge, rules);
    rmSync(bare, { recursive: true, force: true });

    expect(violations).toEqual([]);
  });

  test("is a context as the others: its store, its use cases, its views and its components", () => {
    expect(violationsWith({
      "src/frontend/shared/presentation/store/sharedStore.ts": "export default {};\n",
      "src/frontend/shared/presentation/view/label-picker/LabelPicker.marko": '<button onClick() { frontendOf($global, "shared"); }>Choisir</button>\n',
      "src/frontend/shared/domain/entity/Choice.ts": "export class Choice {}\n"
    })).toEqual([]);
  });

  test("imports no context: the contexts import it", () => {
    const badge = "src/frontend/shared/presentation/component/badge/Badge.marko";
    expect(violationsWith({ [badge]: 'import "#frontend/notes/domain/entity/Note.js";\n\n<strong/>\n' })).toEqual([["contexts-isolated", badge]]);
  });

  test("a context of the frontend reaches it with #frontend-shared/: #shared/ leads to the context shared of the backend", () => {
    const component = "src/frontend/notes/presentation/component/note-label/NoteLabel.marko";
    expect(violationsWith({ [component]: 'import "#shared/domain/value-object/Label.js";\n\n<p>Notes</p>\n' })).toEqual([["sides-apart", component]]);
  });

  test("the domain of a context does not import its components: the layers of shared are those of a context", () => {
    const entity = "src/frontend/notes/domain/entity/Note.ts";
    expect(violationsWith({ [entity]: 'import "#frontend-shared/presentation/component/badge/badge.js";\n\nexport class Note {}\n' })).toEqual([["layer-direction", entity]]);
  });
});
