import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { checkArchitecture } from "./architecture.mjs";
import { rules } from "../template/caits/architecture.mjs";
import { allowed } from "../template/caits/imports.mjs";

/** @import { Packages, Rule } from "./architecture.mjs" */

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
const BACKEND_MAP_IMPORTS = `import { share, when } from "@ingenioz-it/caits/messaging/ContextMap";
import { AddNoteCommand } from "#context/command/add-note/add-note.dto.js";
import { NoteAdded } from "#context/domain/event/NoteAdded.js";
import { NotePosted } from "#shared/domain/event/NotePosted.js";
import { UserJoined } from "#shared/domain/event/UserJoined.js";
`;

/**
 * The violations of the project with these files added or changed, with the packages of CAITS (quality/caits/imports.mjs) or others.
 * @param {Partial<Record<string, string>>} [files]
 * @param {Packages} [packages]
 */
const checkWith = (files = {}, packages = allowed) => checkArchitecture(ROOT, Object.entries(/** @type {Record<string, string>} */ ({ ...project, ...files })).map(([path, text]) => ({ path, text })), rules, packages).violations;
/** The violations of the project with these files added or changed, as [rule, file]. @type {(files?: Partial<Record<string, string>>, packages?: Packages) => string[][]} */
const violationsWith = (files, packages) => checkWith(files, packages).map(({ rule, file }) => [rule, file]);
/** The rule and the message of each violation of the project with these files. @type {(files?: Partial<Record<string, string>>) => string[][]} */
const messagesWith = files => checkWith(files).map(({ rule, message }) => [rule, message]);

const handler = "src/backend/notes/command/add-note/add-note.handler.ts";
const entity = "src/backend/notes/domain/entity/Note.ts";
const store = "src/frontend/notes/presentation/store/notesStore.ts";
const contextMap = "src/backend/notes/context-map.ts";
const backendRoute = "src/routes/_backend/api/notes/+handler.ts";
const controller = "src/backend/notes/command/add-note/add-note.http.controller.ts";
const backendAdapter = "src/backend/notes/infra/note-repository/in-memory-note-repository.ts";
const frontendAdapter = "src/frontend/notes/infra/notes-gateway/http-notes-gateway.ts";

/**
 * For each rule: what breaks it, and the files that do so. The project then breaks this rule in the first of these files, and no other
 * rule, unless `expected` lists all the violations.
 */
const cases = [
  { rule: "container-built-by-kernel", breaks: "a handler makes a Container", files: { [handler]: "import type { AddNoteOutput } from \"./add-note.dto.js\";\nexport class AddNoteHandler { container = new Container(); execute(): AddNoteOutput { return new AddNoteOutput(); } }\n" } },
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
      ["port-folder-named-after-port", "src/backend/notes/domain/port/time/Clock.contract.ts"]
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
  { rule: "domain-imports-only-listed-packages", breaks: "an entity imports a package that the domain does not list", files: { [entity]: 'import { v4 } from "uuid";\n\nexport class Note { readonly id = v4(); }\n' } },
  {
    rule: "application-imports-only-listed-packages", breaks: "a handler imports a Node API that the application does not list",
    files: { [handler]: 'import { randomUUID } from "node:crypto";\n\nimport type { AddNoteOutput } from "./add-note.dto.js";\nexport class AddNoteHandler { execute(): AddNoteOutput { randomUUID(); return new AddNoteOutput(); } }\n' }
  },
  {
    rule: "presentation-imports-only-listed-packages", breaks: "a controller imports a package that the list of the presentation does not hold",
    packages: { ...allowed, presentation: ["@ingenioz-it/caits/*"] },
    files: { [controller]: `import { format } from "date-fns";\n${project[controller]}` }
  },
  {
    rule: "infra-imports-only-listed-packages", breaks: "an adapter imports a Node API that the list of the infra does not hold",
    packages: { ...allowed, infra: [] },
    files: { "src/backend/notes/infra/note-repository/in-memory-note-repository.ts": `import "node:fs";\n${project["src/backend/notes/infra/note-repository/in-memory-note-repository.ts"]}` }
  },
  {
    rule: "di-imports-only-listed-packages", breaks: "a di.ts imports a package that the list of di.ts does not hold",
    packages: { ...allowed, di: ["@ingenioz-it/caits/di/Container"] },
    files: { "src/backend/notes/di.ts": `import "node:path";\n${project["src/backend/notes/di.ts"]}` }
  },
  {
    rule: "context-map-imports-only-listed-packages", breaks: "a context map imports a package that the list of the context maps does not hold",
    packages: { ...allowed, contextMap: ["@ingenioz-it/caits/messaging/ContextMap", "@ingenioz-it/caits/messaging/FrontendContextMap"] },
    files: { [contextMap]: `import "lodash";\n${project[contextMap]}` }
  },
  { rule: "entity-without-port", breaks: "an entity imports a port", files: { [entity]: 'import type { NoteRepository } from "#context/domain/port/note-repository/NoteRepository.js";\n\nexport class Note { repository?: NoteRepository; }\n' } },

  { rule: "backend-use-case-shape", breaks: "a use case holds a helper", files: { "src/backend/notes/command/add-note/helpers.ts": "export const trim = (text: string) => text.trim();\n" } },
  { rule: "frontend-use-case-shape", breaks: "a use case of the frontend has a controller", files: { "src/frontend/notes/query/list-notes/list-notes.http.controller.ts": "export class ListNotesHttpController {}\n" } },
  {
    rule: "use-cases-isolated", breaks: "a controller sends the DTO of another use case",
    files: { "src/backend/notes/query/list-notes/list-notes.http.controller.ts": 'import { AddNoteCommand } from "#context/command/add-note/add-note.dto.js";\n\nexport class ListNotesHttpController extends Controller { toDto() { return new AddNoteCommand(); } }\n' }
  },
  { rule: "handler-answers-output", breaks: "a handler answers with what is not a DTO", files: { [handler]: "export class AddNoteHandler { execute(): void {} }\n" } },
  { rule: "controller-extends-controller", breaks: "a controller does not extend the Controller of the kernel", files: { "src/backend/notes/command/add-note/add-note.http.controller.ts": "export class AddNoteHttpController {}\n" } },
  { rule: "frontend-event-shape", breaks: "the events hold a folder", files: { "src/frontend/notes/event/loaded/NotesLoaded.ts": 'export class NotesLoaded { readonly type = "notes.loaded" as const; }\n' } },
  {
    rule: "event-file-exports-its-event", breaks: "an event file exports a constant too",
    files: { "src/frontend/notes/event/NotesLoaded.ts": 'export class NotesLoaded { readonly type = "notes.loaded" as const; }\nexport const LIMIT = 10;\n' }
  },
  { rule: "event-type-names-context", breaks: "the type of an event is not its name", files: { "src/frontend/notes/event/NotesLoaded.ts": 'export class NotesLoaded { readonly type = "notes.load" as const; }\n' } },

  { rule: "frontend-presentation-shape", breaks: "the presentation holds a helper out of a view", files: { "src/frontend/notes/presentation/helpers.ts": "export const trim = (text: string) => text.trim();\n" } },
  { rule: "zod-in-presentation", breaks: "an adapter of the backend imports zod", files: { [backendAdapter]: `import { z } from "zod";\n${project[backendAdapter]}` } },
  { rule: "marko-in-frontend-presentation", breaks: "an adapter of the frontend imports Marko", files: { [frontendAdapter]: `import "marko";\n${project[frontendAdapter]}` } },
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

  { rule: "backend-infra-shape", breaks: "an adapter is not named after its port", files: { "src/backend/notes/infra/note-repository/memory.ts": 'import type { NoteRepository } from "#context/domain/port/note-repository/NoteRepository.js";\n\nexport class Memory implements NoteRepository {}\n' } },
  { rule: "infra-folder-implements-port", breaks: "a folder of the infra has no port", files: { "src/backend/notes/infra/clock/system-clock.ts": "export class SystemClock implements Clock {}\n" } },
  { rule: "adapter-implements-port", breaks: "an adapter does not implement its port", files: { "src/backend/notes/infra/note-repository/file-note-repository.ts": "export class FileNoteRepository {}\n" } },
  { rule: "adapter-test-runs-contract", breaks: "the test of an adapter does not run the contract", files: { "src/backend/notes/infra/note-repository/file-note-repository.test.ts": "test();\n" } },

  { rule: "di-holds-bindings", breaks: "a di.ts builds its dependency", files: { "src/backend/notes/di.ts": "export default [new InMemoryNoteRepository()];\n" } },
  { rule: "di-read-by-kernel", breaks: "a handler imports the di.ts", files: { [handler]: 'import "#context/di.js";\n\nimport type { AddNoteOutput } from "./add-note.dto.js";\nexport class AddNoteHandler { execute(): AddNoteOutput { return new AddNoteOutput(); } }\n' } },

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
  { rule: "imports-by-shortcut", breaks: "a handler imports by going up folders", files: { [handler]: 'import "../../domain/entity/Note.js";\n\nimport type { AddNoteOutput } from "./add-note.dto.js";\nexport class AddNoteHandler { execute(): AddNoteOutput { return new AddNoteOutput(); } }\n' } },
  { rule: "contexts-isolated", breaks: "a context imports another context", files: { [handler]: 'import "#backend/alerts/domain/event/AlertRaised.js";\n\nimport type { AddNoteOutput } from "./add-note.dto.js";\nexport class AddNoteHandler { execute(): AddNoteOutput { return new AddNoteOutput(); } }\n' } },
  { rule: "tests-in-one-context", breaks: "the test of a use case imports another context", files: { "src/backend/notes/command/add-note/add-note.application.test.ts": 'import { RaiseCommand } from "#backend/alerts/command/raise/raise.dto.js";\n\ntest(() => new RaiseCommand());\n' } },
  { rule: "sides-apart", breaks: "the frontend imports the backend", files: { [store]: 'import { AddNoteCommand } from "#backend/notes/command/add-note/add-note.dto.js";\n\nexport default { send: () => new AddNoteCommand() };\n' } },
  { rule: "domain-imports-no-application", breaks: "the domain imports an input DTO", files: { [entity]: 'import { AddNoteCommand } from "#context/command/add-note/add-note.dto.js";\n\nexport class Note { command?: AddNoteCommand; }\n' } },
  { rule: "domain-imports-no-presentation", breaks: "the domain imports a controller", files: { [entity]: 'import "#context/command/add-note/add-note.http.controller.js";\n\nexport class Note {}\n' } },
  { rule: "domain-imports-no-infra", breaks: "the domain imports an adapter", files: { [entity]: 'import "#context/infra/note-repository/in-memory-note-repository.js";\n\nexport class Note {}\n' } },
  { rule: "application-imports-no-presentation", breaks: "a handler imports its controller", files: { [handler]: 'import "./add-note.http.controller.js";\n\nimport type { AddNoteOutput } from "./add-note.dto.js";\nexport class AddNoteHandler { execute(): AddNoteOutput { return new AddNoteOutput(); } }\n' } },
  { rule: "application-imports-no-infra", breaks: "a handler imports an adapter", files: { [handler]: 'import "#context/infra/note-repository/in-memory-note-repository.js";\n\nimport type { AddNoteOutput } from "./add-note.dto.js";\nexport class AddNoteHandler { execute(): AddNoteOutput { return new AddNoteOutput(); } }\n' } },
  { rule: "presentation-imports-no-infra", breaks: "a controller imports an adapter", files: { [controller]: `import "#context/infra/note-repository/in-memory-note-repository.js";\n${project[controller]}` } },
  {
    rule: "infra-imports-no-presentation", breaks: "an adapter of the frontend imports a view",
    files: { "src/frontend/notes/infra/notes-gateway/http-notes-gateway.ts": `import "#context/presentation/view/notes-block/NotesBlock.marko";\n${project["src/frontend/notes/infra/notes-gateway/http-notes-gateway.ts"]}` }
  },
  {
    rule: "infra-imports-no-application", breaks: "an adapter of the backend imports an input DTO",
    files: { "src/backend/notes/infra/note-repository/in-memory-note-repository.ts": `import "#context/command/add-note/add-note.dto.js";\n${project["src/backend/notes/infra/note-repository/in-memory-note-repository.ts"]}` }
  },
  { rule: "di-imports-no-application", breaks: "a di.ts imports a handler", files: { "src/backend/notes/di.ts": `import "./command/add-note/add-note.handler.js";\n${project["src/backend/notes/di.ts"]}` } },
  { rule: "di-imports-no-presentation", breaks: "a di.ts imports a controller", files: { "src/backend/notes/di.ts": `import "./command/add-note/add-note.http.controller.js";\n${project["src/backend/notes/di.ts"]}` } },
  { rule: "context-map-read-by-kernel", breaks: "a view imports the context map", files: { "src/frontend/notes/presentation/view/notes-count/NotesCount.marko": 'import "#context/context-map.js";\n\n<p>Notes</p>\n' } },
  { rule: "contexts-without-routes", breaks: "a handler imports a route", files: { [handler]: 'import "/src/routes/_backend/api/notes/+handler.js";\n\nimport type { AddNoteOutput } from "./add-note.dto.js";\nexport class AddNoteHandler { execute(): AddNoteOutput { return new AddNoteOutput(); } }\n' } },

  { rule: "routes-folders", breaks: "a route is out of _frontend and _backend", files: { "src/routes/api/+handler.ts": "export const GET = () => null;\n" } },
  { rule: "frontend-routes-content", breaks: "the frontend routes hold a helper out of component/", files: { "src/routes/_frontend/helpers.ts": "export const trim = (text: string) => text.trim();\n" } },
  { rule: "backend-routes-content", breaks: "the backend routes hold a helper", files: { "src/routes/_backend/api/notes/helpers.ts": "export const trim = (text: string) => text.trim();\n" } },
  {
    rule: "routes-on-their-side", breaks: "a frontend route imports the backend",
    files: { "src/routes/_frontend/component/Notes.marko": 'import "#backend/notes/command/add-note/add-note.http.controller.js";\n\n<p>Notes</p>\n' }
  },
  { rule: "routes-through-presentation", breaks: "a route imports an input DTO", files: { [backendRoute]: 'import "#backend/notes/command/add-note/add-note.dto.js";\n' } },
  { rule: "routes-take-no-frontend", breaks: "a page takes a frontend", files: { "src/routes/_frontend/+page.marko": '<button onClick() { frontendOf($global, "notes"); }>Charger</button>\n' } },

  { rule: "production-imports-no-test-environment", breaks: "a handler imports a test.di.ts", files: { [handler]: 'import "#context/test.di.js";\n\nimport type { AddNoteOutput } from "./add-note.dto.js";\nexport class AddNoteHandler { execute(): AddNoteOutput { return new AddNoteOutput(); } }\n' } },
  {
    rule: "production-imports-no-test-support", breaks: "an adapter imports the test support of the kernel",
    files: { [backendAdapter]: `import "@ingenioz-it/caits/testing/backend/infra";\n${project[backendAdapter]}` }
  },
  {
    rule: "production-imports-only-src", breaks: "a handler imports a file of test/",
    files: { [handler]: 'import "../../../../../test/support/notes.js";\n\nimport type { AddNoteOutput } from "./add-note.dto.js";\nexport class AddNoteHandler { execute(): AddNoteOutput { return new AddNoteOutput(); } }\n' },
    expected: [["imports-by-shortcut", handler], ["production-imports-only-src", handler]]
  },

  { rule: "exceptions-in-quality", breaks: "a comment turns off a rule of ESLint", files: { [handler]: "// eslint-disable-next-line @typescript-eslint/no-explicit-any\nimport type { AddNoteOutput } from \"./add-note.dto.js\";\nexport class AddNoteHandler { execute(): AddNoteOutput { return new AddNoteOutput(); } }\n" } }
];


describe("the architecture rules", () => {
  test("a small project of each kind of file breaks no rule", () => {
    expect(violationsWith()).toEqual([]);
  });

  test.for(cases)("$rule: $breaks", ({ rule, files, packages, expected = [[rule, Object.keys(files)[0]]] }) => {
    expect(violationsWith(files, packages)).toEqual(expected);
  });

  test("each rule has a case that breaks it", () => {
    expect(cases.map(({ rule }) => rule)).toEqual(rules.map(({ name }) => name));
  });
});

/**
 * Each message of each rule, one per branch: the rule, the branch, the files that take it, and what the rule says, as [file, line, message].
 * The line is undefined when the rule points at no construct. The packages are those of CAITS, unless the branch gives others.
 */
const messages = [
  { rule: "container-built-by-kernel", branch: "in a context", files: { [handler]: "import type { AddNoteOutput } from \"./add-note.dto.js\";\nexport class AddNoteHandler {\n  container = new Container();\n  execute(): AddNoteOutput { return new AddNoteOutput(); }\n}\n" }, expected: [
      ["src/backend/notes/command/add-note/add-note.handler.ts", 3, "This file builds a Container, but only the kernel builds the containers, from the di.ts of each context. Remove `new Container(…)`, and bind what it holds in src/backend/notes/di.ts."]
    ] },
  { rule: "container-built-by-kernel", branch: "out of a context", files: { [backendRoute]: `${project[backendRoute]}export const container = new Container();\n` }, expected: [
      ["src/routes/_backend/api/notes/+handler.ts", 5, "This file builds a Container, but only the kernel builds the containers, from the di.ts of each context. Remove `new Container(…)`, and bind what it holds in the di.ts of the context that uses it."]
    ] },
  { rule: "controllers-built-by-kernel", branch: "in a route", files: { [backendRoute]: "export const POST = () => new AddNoteHttpController();\n" }, expected: [
      ["src/routes/_backend/api/notes/+handler.ts", 1, "This file builds AddNoteHttpController with `new`, but only the kernel builds a controller, with its dependencies. Ask the kernel for it with `controller(AddNoteHttpController)`, from @ingenioz-it/caits/di/backend."]
    ] },
  { rule: "controllers-built-by-kernel", branch: "elsewhere", files: { "test/support/notes.ts": "export const make = () => new AddNoteHttpController();\n" }, expected: [
      ["test/support/notes.ts", 1, "This file builds AddNoteHttpController with `new`, but only the kernel builds a controller, with its dependencies. Send the request through the router instead."]
    ] },

  { rule: "domain-shape", branch: "at the root of the domain", files: { "src/backend/notes/domain/helpers.ts": "export const trim = (text: string) => text.trim();\n" }, expected: [
      ["src/backend/notes/domain/helpers.ts", undefined, "helpers.ts is at the root of the domain, but the domain holds only entity/, value-object/, error/, event/ and port/. Move its code into an entity or a value object, or move the file to the folder of its kind."]
    ] },
  { rule: "domain-shape", branch: "in an unknown folder", files: { "src/backend/notes/domain/service/Notes.ts": "export class Notes {}\n" }, expected: [
      ["src/backend/notes/domain/service/Notes.ts", undefined, "Notes.ts is in domain/service/, but the domain holds only entity/, value-object/, error/, event/ and port/. Move its code into an entity or a value object, or move the file to the folder of its kind."]
    ] },
  { rule: "domain-shape", branch: "a port without its folder", files: { "src/backend/notes/domain/port/Clock.ts": "export interface Clock { now(): Date }\n" }, expected: [
      ["src/backend/notes/domain/port/Clock.ts", undefined, "Clock.ts is in port/, but a port lives in a folder of its own, port/{port}/{Port}.ts. Move it to src/backend/notes/domain/port/clock/Clock.ts."]
    ] },
  { rule: "domain-shape", branch: "a test of an error", files: { "src/backend/notes/domain/error/InvalidNoteError.test.ts": "test();\n" }, expected: [
      ["src/backend/notes/domain/error/InvalidNoteError.test.ts", undefined, "InvalidNoteError.test.ts is a test in error/, but in the domain only the entities and the value objects have a test. Test it through the application test of a use case."]
    ] },
  { rule: "domain-shape", branch: "a test of a port", files: { "src/backend/notes/domain/port/note-repository/NoteRepository.test.ts": "test();\n" }, expected: [
      ["src/backend/notes/domain/port/note-repository/NoteRepository.test.ts", undefined, "NoteRepository.test.ts is a test in port/, but in the domain only the entities and the value objects have a test. Test it through the application test of a use case, or through the contract of the port."]
    ] },
  { rule: "domain-shape", branch: "an error in a file of another name than its class", files: { "src/backend/notes/domain/error/EmptyNote.ts": "export class EmptyNoteError extends Error {}\n" }, expected: [] },
  { rule: "domain-shape", branch: "an entity whose name is not in PascalCase", files: { "src/backend/notes/domain/entity/note-item.ts": "export class NoteItem {}\n" }, expected: [
      ["src/backend/notes/domain/entity/note-item.ts", undefined, "note-item.ts is in entity/, but the file of an entity is in PascalCase: entity/{Entity}.ts. Rename it NoteItem.ts."]
    ] },
  { rule: "domain-shape", branch: "an entity in a folder of its own", files: { "src/backend/notes/domain/entity/parts/Part.ts": "export class Part {}\n" }, expected: [
      ["src/backend/notes/domain/entity/parts/Part.ts", undefined, "Part.ts is in entity/parts/, but its place is entity/. Move it to src/backend/notes/domain/entity/Part.ts."]
    ] },
  { rule: "domain-shape", branch: "a port whose name is not the name of its folder", files: { "src/backend/notes/domain/port/note-repository/repository.ts": "export interface Repository {}\n" }, expected: [
      ["src/backend/notes/domain/port/note-repository/repository.ts", undefined, "repository.ts is in port/note-repository/, but a port is port/{port}/{Port}.ts, beside its contract {Port}.contract.ts. Rename it NoteRepository.ts."]
    ] },
  { rule: "domain-file-exports-one-name", branch: "several names", files: { [entity]: "export class Note {}\nexport const MAX_LENGTH = 280;\n" }, expected: [
      ["src/backend/notes/domain/entity/Note.ts", 2, "Note.ts exports 2 names (Note, MAX_LENGTH), but a domain file exports one name. Move MAX_LENGTH into Note as a static member, or to a file of its own."]
    ] },
  {
    rule: "domain-file-exports-one-name", branch: "a port, which shares its name with its token",
    files: { "src/backend/notes/domain/port/note-repository/NoteRepository.ts": `${project["src/backend/notes/domain/port/note-repository/NoteRepository.ts"]}export const LIMIT = 3;\n` }, expected: [
      ["src/backend/notes/domain/port/note-repository/NoteRepository.ts", 7, "NoteRepository.ts exports 2 names (NoteRepository, LIMIT), but a domain file exports one name, which the port and its token share. Move LIMIT into NoteRepository as a static member, or to a file of its own."]
    ]
  },
  { rule: "domain-file-exports-one-name", branch: "an export without a name", files: { [entity]: "export default class Note {}\n" }, expected: [
      ["src/backend/notes/domain/entity/Note.ts", 1, "Note.ts has an export without a name (export default), but a domain file exports one name. Export its declaration with its name: `export class …`."]
    ] },
  { rule: "domain-file-exports-one-name", branch: "a name of a list", files: { [entity]: "class Note {}\nexport { Note };\n" }, expected: [
      ["src/backend/notes/domain/entity/Note.ts", 2, "Note.ts exports Note from a list, `export { … }`, but a domain file exports its one name where it declares it. Write `export` before the declaration of Note."]
    ] },
  { rule: "domain-file-exports-one-name", branch: "no export", files: { [entity]: "class Note {}\n" }, expected: [
      ["src/backend/notes/domain/entity/Note.ts", undefined, "Note.ts exports nothing, but a domain file exports one name. Write `export` before its declaration."]
    ] },
  { rule: "entity-is-class", branch: "exported as something else", files: { "src/backend/notes/domain/value-object/Text.ts": "export type Text = string;\n" }, expected: [
      ["src/backend/notes/domain/value-object/Text.ts", 1, "Text.ts exports Text as a type, but a value object is an exported class, which holds the business rules of its values. Make it a class, `export class …`, and put the rules of its values in it."]
    ] },
  { rule: "entity-is-class", branch: "a class of another name than its file", files: { [entity]: "export class Memo {}\n" }, expected: [] },
  { rule: "entity-is-class", branch: "no exported class", files: { [entity]: "export const note = 1;\n" }, expected: [
      ["src/backend/notes/domain/entity/Note.ts", 1, "Note.ts exports note as a constant, but an entity is an exported class, which holds the business rules of its values. Make it a class, `export class …`, and put the rules of its values in it."]
    ] },
  { rule: "error-extends-error", branch: "a class that extends nothing", files: { "src/backend/notes/domain/error/EmptyNoteError.ts": "export class EmptyNoteError {}\n" }, expected: [
      ["src/backend/notes/domain/error/EmptyNoteError.ts", 1, "EmptyNoteError extends nothing, but a domain error is an exported class …Error that extends Error. Write `export class EmptyNoteError extends Error`."]
    ] },
  { rule: "error-extends-error", branch: "a class that is not exported", files: { "src/backend/notes/domain/error/EmptyNoteError.ts": "class EmptyNoteError extends Error {}\n" }, expected: [
      ["src/backend/notes/domain/error/EmptyNoteError.ts", 1, "EmptyNoteError is not exported, but a domain error is an exported class …Error that extends Error. Write `export class EmptyNoteError extends Error`."]
    ] },
  { rule: "error-extends-error", branch: "an error of another name than its file", files: { "src/backend/notes/domain/error/EmptyNote.ts": "export class BlankNoteError extends Error {}\n" }, expected: [] },
  { rule: "error-extends-error", branch: "a class whose name does not end with Error", files: { "src/backend/notes/domain/error/EmptyNoteError.ts": "export class Empty extends Error {}\n" }, expected: [
      ["src/backend/notes/domain/error/EmptyNoteError.ts", 1, "Empty does not end with Error, but a domain error is an exported class …Error that extends Error. Write `export class EmptyError extends Error`."]
    ] },
  {
    rule: "port-folder-named-after-port", branch: "a port and its contract, with their adapters",
    files: {
      "src/backend/notes/domain/port/time/Clock.ts": "export interface Clock { now(): Date }\n",
      "src/backend/notes/domain/port/time/Clock.contract.ts": "export function describeClockContract(): void {}\n",
      "src/backend/notes/infra/time/system-time.test.ts": 'import { describeClockContract } from "#context/domain/port/time/Clock.contract.js";\n'
    },
    expected: [
      ["src/backend/notes/domain/port/time/Clock.ts", undefined, "The port Clock is in port/time/, but the folder of a port is its name in kebab-case, port/clock/. Move it to src/backend/notes/domain/port/clock/Clock.ts, and its adapters from src/backend/notes/infra/time/ to src/backend/notes/infra/clock/."],
      ["src/backend/notes/domain/port/time/Clock.contract.ts", undefined, "The contract of the port Clock is in port/time/, but the folder of a port is its name in kebab-case, port/clock/. Move it to src/backend/notes/domain/port/clock/Clock.contract.ts, and its adapters from src/backend/notes/infra/time/ to src/backend/notes/infra/clock/."]
    ]
  },
  {
    rule: "port-folder-named-after-port", branch: "a port without adapters",
    files: { "src/backend/notes/domain/port/time/Clock.ts": "export interface Clock { now(): Date }\n", "src/backend/notes/domain/port/time/Clock.contract.ts": "export function describeClockContract(): void {}\n" },
    expected: [
      ["src/backend/notes/domain/port/time/Clock.ts", undefined, "The port Clock is in port/time/, but the folder of a port is its name in kebab-case, port/clock/. Move it to src/backend/notes/domain/port/clock/Clock.ts."],
      ["src/backend/notes/domain/port/time/Clock.contract.ts", undefined, "The contract of the port Clock is in port/time/, but the folder of a port is its name in kebab-case, port/clock/. Move it to src/backend/notes/domain/port/clock/Clock.contract.ts."]
    ]
  },
  {
    rule: "port-has-contract", branch: "a port whose adapters have tests",
    files: {
      "src/backend/notes/domain/port/clock/Clock.ts": "export interface Clock { now(): Date }\n",
      "src/backend/notes/infra/clock/system-clock.ts": "export class SystemClock implements Clock { now() { return new Date(); } }\n",
      "src/backend/notes/infra/clock/system-clock.test.ts": "test();\n"
    },
    expected: [
      ["src/backend/notes/domain/port/clock/Clock.ts", undefined, "The port Clock has no contract, so nothing says what each of its adapters must do. Write src/backend/notes/domain/port/clock/Clock.contract.ts, and run it in the test of each adapter in src/backend/notes/infra/clock/ (system-clock.test.ts)."]
    ]
  },
  { rule: "port-has-contract", branch: "a port without adapters", files: { "src/backend/notes/domain/port/clock/Clock.ts": "export interface Clock { now(): Date }\n" }, expected: [
      ["src/backend/notes/domain/port/clock/Clock.ts", undefined, "The port Clock has no contract, so nothing says what each of its adapters must do. Write src/backend/notes/domain/port/clock/Clock.contract.ts, and run it in the test of each adapter in src/backend/notes/infra/clock/."]
    ] },
  { rule: "contract-next-to-port", branch: "a port of its name", files: { "test/support/NoteRepository.contract.ts": "export function describeNoteRepositoryContract(): void {}\n" }, expected: [
      ["test/support/NoteRepository.contract.ts", undefined, "NoteRepository.contract.ts is the contract of NoteRepository, but it is not next to its port. Move it to src/backend/notes/domain/port/note-repository/NoteRepository.contract.ts, beside src/backend/notes/domain/port/note-repository/NoteRepository.ts."]
    ] },
  {
    rule: "contract-next-to-port", branch: "a port of its name in two contexts",
    files: {
      "test/support/Clock.contract.ts": "export function describeClockContract(): void {}\n",
      "src/backend/notes/domain/port/clock/Clock.ts": "export interface Clock { now(): Date }\n",
      "src/frontend/notes/domain/port/clock/Clock.ts": "export interface Clock { now(): Date }\n"
    },
    expected: [
      ["test/support/Clock.contract.ts", undefined, "Clock.contract.ts is the contract of Clock, but it is not next to its port. Move it next to the port that it describes: src/backend/notes/domain/port/clock/Clock.contract.ts, or src/frontend/notes/domain/port/clock/Clock.contract.ts."]
    ]
  },
  { rule: "contract-next-to-port", branch: "no port of its name", files: { "test/support/Clock.contract.ts": "export function describeClockContract(): void {}\n" }, expected: [
      ["test/support/Clock.contract.ts", undefined, "Clock.contract.ts is a contract, but no port Clock exists: a contract lives in domain/port/clock/, beside the port that it describes. Write the port Clock in the domain/port/clock/ of its context, and move the contract beside it."]
    ] },
  {
    rule: "contract-runs-in-adapter-test", branch: "adapters with tests",
    files: {
      "src/backend/notes/domain/port/clock/Clock.contract.ts": "export function describeClockContract(): void {}\n",
      "src/backend/notes/domain/port/clock/Clock.ts": "export interface Clock { now(): Date }\n",
      "src/backend/notes/infra/clock/system-clock.ts": "export class SystemClock implements Clock { now() { return new Date(); } }\n",
      "src/backend/notes/infra/clock/system-clock.test.ts": "test();\n"
    },
    expected: [
      ["src/backend/notes/domain/port/clock/Clock.contract.ts", undefined, "No test runs the contract of Clock, so it checks nothing. Call describeClockContract in the test of each adapter in src/backend/notes/infra/clock/ (system-clock.test.ts)."]
    ]
  },
  {
    rule: "contract-runs-in-adapter-test", branch: "adapters without tests",
    files: {
      "src/backend/notes/domain/port/clock/Clock.contract.ts": "export function describeClockContract(): void {}\n",
      "src/backend/notes/domain/port/clock/Clock.ts": "export interface Clock { now(): Date }\n",
      "src/backend/notes/infra/clock/system-clock.ts": "export class SystemClock implements Clock { now() { return new Date(); } }\n"
    },
    expected: [
      ["src/backend/notes/domain/port/clock/Clock.contract.ts", undefined, "No test runs the contract of Clock, so it checks nothing. Call describeClockContract in the test of each adapter in src/backend/notes/infra/clock/ (system-clock.ts)."]
    ]
  },
  {
    rule: "contract-runs-in-adapter-test", branch: "no adapter",
    files: { "src/backend/notes/domain/port/clock/Clock.contract.ts": "export const contract = 1;\n", "src/backend/notes/domain/port/clock/Clock.ts": "export interface Clock { now(): Date }\n" },
    expected: [
      ["src/backend/notes/domain/port/clock/Clock.contract.ts", undefined, "No test runs the contract of Clock, so it checks nothing. Write an adapter of Clock in src/backend/notes/infra/clock/, with a test that calls the function that the contract exports."]
    ]
  },
  { rule: "domain-imports-only-listed-packages", branch: "a package", files: { [entity]: 'import { v4 } from "uuid";\n\nexport class Note { readonly id = v4(); }\n' }, expected: [
      ["src/backend/notes/domain/entity/Note.ts", 1, "The domain layer imports uuid, a package that quality/imports.mjs does not list for the domain. Declare what it needs as a port in src/backend/notes/domain/port/, and implement it in the infra; or, to use uuid in the domain anyway, add it to the domain in quality/imports.mjs."]
    ] },
  { rule: "domain-imports-only-listed-packages", branch: "a Node API", files: { [entity]: 'import { randomUUID } from "node:crypto";\n\nexport class Note { readonly id = randomUUID(); }\n' }, expected: [
      ["src/backend/notes/domain/entity/Note.ts", 1, "The domain layer imports node:crypto, a Node API that quality/imports.mjs does not list for the domain. Declare what it needs as a port in src/backend/notes/domain/port/, and implement it in the infra; or, to use node:crypto in the domain anyway, add it to the domain in quality/imports.mjs."]
    ] },
  { rule: "domain-imports-only-listed-packages", branch: "a bus of the kernel", files: { [entity]: 'import "@ingenioz-it/caits/messaging/FrontendEventBus";\n\nexport class Note {}\n' }, expected: [
      ["src/backend/notes/domain/entity/Note.ts", 1, "The domain layer imports @ingenioz-it/caits/messaging/FrontendEventBus, a module of the kernel that quality/imports.mjs does not list for the domain. Let a handler publish the events, and keep the domain free of buses."]
    ] },
  { rule: "domain-imports-only-listed-packages", branch: "the state of the kernel", files: { [entity]: 'import "@ingenioz-it/caits/state/Loadable";\n\nexport class Note {}\n' }, expected: [
      ["src/backend/notes/domain/entity/Note.ts", 1, "The domain layer imports @ingenioz-it/caits/state/Loadable, a module of the kernel that quality/imports.mjs does not list for the domain. Keep the state in the store of the presentation, and let the domain give values."]
    ] },
  { rule: "domain-imports-only-listed-packages", branch: "the dependency injection of the kernel", files: { [entity]: 'import "@ingenioz-it/caits/di/Container";\n\nexport class Note {}\n' }, expected: [
      ["src/backend/notes/domain/entity/Note.ts", 1, "The domain layer imports @ingenioz-it/caits/di/Container, a module of the kernel that quality/imports.mjs does not list for the domain. Declare what the domain needs as a port, and let di.ts bind it."]
    ] },
  { rule: "domain-imports-only-listed-packages", branch: "another module of the kernel", files: { [entity]: 'import "@ingenioz-it/caits/http/failureOf";\n\nexport class Note {}\n' }, expected: [
      ["src/backend/notes/domain/entity/Note.ts", 1, "The domain layer imports @ingenioz-it/caits/http/failureOf, a module of the kernel that quality/imports.mjs does not list for the domain. Move the code that needs it out of the domain."]
    ] },
  { rule: "domain-imports-only-listed-packages", branch: "a package that the list holds", packages: { ...allowed, domain: [...allowed.domain, "uuid"] }, files: { [entity]: 'import "uuid";\n\nexport class Note {}\n' }, expected: [] },
  { rule: "domain-imports-only-listed-packages", branch: "a module of a folder that the list holds", packages: { ...allowed, domain: [...allowed.domain, "uuid/*"] }, files: { [entity]: 'import "uuid/v4";\n\nexport class Note {}\n' }, expected: [] },
  { rule: "domain-imports-only-listed-packages", branch: "without a list", packages: {}, files: { [entity]: 'import "uuid";\n\nexport class Note {}\n' }, expected: [] },
  { rule: "application-imports-only-listed-packages", branch: "a Node API", files: { [handler]: 'import { randomUUID } from "node:crypto";\n\nimport type { AddNoteOutput } from "./add-note.dto.js";\nexport class AddNoteHandler { execute(): AddNoteOutput { randomUUID(); return new AddNoteOutput(); } }\n' }, expected: [
      ["src/backend/notes/command/add-note/add-note.handler.ts", 1, "The application layer imports node:crypto, a Node API that quality/imports.mjs does not list for the application. Declare what it needs as a port in src/backend/notes/domain/port/, implement it in the infra, and bind the adapter in src/backend/notes/di.ts; or, to use node:crypto in the application anyway, add it to the application in quality/imports.mjs."]
    ] },
  { rule: "application-imports-only-listed-packages", branch: "a package", files: { [handler]: 'import "lodash";\n\nimport type { AddNoteOutput } from "./add-note.dto.js";\nexport class AddNoteHandler { execute(): AddNoteOutput { return new AddNoteOutput(); } }\n' }, expected: [
      ["src/backend/notes/command/add-note/add-note.handler.ts", 1, "The application layer imports lodash, a package that quality/imports.mjs does not list for the application. Declare what it needs as a port in src/backend/notes/domain/port/, implement it in the infra, and bind the adapter in src/backend/notes/di.ts; or, to use lodash in the application anyway, add it to the application in quality/imports.mjs."]
    ] },
  { rule: "application-imports-only-listed-packages", branch: "the state of the kernel", files: { [handler]: 'import "@ingenioz-it/caits/state/Loadable";\n\nimport type { AddNoteOutput } from "./add-note.dto.js";\nexport class AddNoteHandler { execute(): AddNoteOutput { return new AddNoteOutput(); } }\n' }, expected: [
      ["src/backend/notes/command/add-note/add-note.handler.ts", 1, "The application layer imports @ingenioz-it/caits/state/Loadable, a module of the kernel that quality/imports.mjs does not list for the application. Keep the state in the store of the presentation, and publish an event that the store hears."]
    ] },
  { rule: "application-imports-only-listed-packages", branch: "the dependency injection of the kernel", files: { [handler]: 'import "@ingenioz-it/caits/di/Container";\n\nimport type { AddNoteOutput } from "./add-note.dto.js";\nexport class AddNoteHandler { execute(): AddNoteOutput { return new AddNoteOutput(); } }\n' }, expected: [
      ["src/backend/notes/command/add-note/add-note.handler.ts", 1, "The application layer imports @ingenioz-it/caits/di/Container, a module of the kernel that quality/imports.mjs does not list for the application. Depend on a port of the domain, and let di.ts bind its adapter."]
    ] },
  { rule: "application-imports-only-listed-packages", branch: "another module of the kernel", files: { [handler]: 'import "@ingenioz-it/caits/messaging/Controller";\n\nimport type { AddNoteOutput } from "./add-note.dto.js";\nexport class AddNoteHandler { execute(): AddNoteOutput { return new AddNoteOutput(); } }\n' }, expected: [
      ["src/backend/notes/command/add-note/add-note.handler.ts", 1, "The application layer imports @ingenioz-it/caits/messaging/Controller, a module of the kernel that quality/imports.mjs does not list for the application. Move the code that needs it into the presentation or the infra."]
    ] },
  { rule: "presentation-imports-only-listed-packages", branch: "a package", packages: { ...allowed, presentation: ["@ingenioz-it/caits/*"] }, files: { [controller]: `import { format } from "date-fns";\n${project[controller]}` }, expected: [
      ["src/backend/notes/command/add-note/add-note.http.controller.ts", 1, "The presentation layer imports date-fns, a package that quality/imports.mjs does not list for the presentation. Add it to the presentation in quality/imports.mjs, or move the code that needs it to a layer whose list holds it."]
    ] },
  { rule: "infra-imports-only-listed-packages", branch: "a Node API", packages: { ...allowed, infra: [] }, files: { [backendAdapter]: `import "node:fs";\n${project[backendAdapter]}` }, expected: [
      ["src/backend/notes/infra/note-repository/in-memory-note-repository.ts", 1, "The infra layer imports node:fs, a Node API that quality/imports.mjs does not list for the infra. Add it to the infra in quality/imports.mjs, or move the code that needs it to a layer whose list holds it."]
    ] },
  { rule: "di-imports-only-listed-packages", branch: "a Node API", packages: { ...allowed, di: ["@ingenioz-it/caits/di/Container"] }, files: { "src/backend/notes/di.ts": `import "node:path";\n${project["src/backend/notes/di.ts"]}` }, expected: [
      ["src/backend/notes/di.ts", 1, "This di.ts imports node:path, a Node API that quality/imports.mjs does not list for di.ts. Add it to di in quality/imports.mjs, or move the code that needs it to a layer whose list holds it."]
    ] },
  {
    rule: "context-map-imports-only-listed-packages", branch: "a package",
    packages: { ...allowed, contextMap: ["@ingenioz-it/caits/messaging/ContextMap", "@ingenioz-it/caits/messaging/FrontendContextMap"] },
    files: { [contextMap]: `import "lodash";\n${project[contextMap]}` }, expected: [
      ["src/backend/notes/context-map.ts", 1, "The context map imports lodash, a package that quality/imports.mjs does not list for the context map. Add it to contextMap in quality/imports.mjs, or move the code that needs it to a layer whose list holds it."]
    ]
  },
  { rule: "entity-without-port", branch: "an entity", files: { [entity]: 'import type { NoteRepository } from "#context/domain/port/note-repository/NoteRepository.js";\n\nexport class Note { repository?: NoteRepository; }\n' }, expected: [
      ["src/backend/notes/domain/entity/Note.ts", 1, "The entity Note imports the port NoteRepository (src/backend/notes/domain/port/note-repository/NoteRepository.js), but an entity or a value object holds business rules, and never talks to a port. Let the handler call NoteRepository, and give Note the values it needs."]
    ] },
  {
    rule: "entity-without-port", branch: "a value object",
    files: { "src/backend/notes/domain/value-object/Text.ts": 'import type { NoteRepository } from "#context/domain/port/note-repository/NoteRepository.js";\n\nexport class Text { repository?: NoteRepository; }\n' }, expected: [
      ["src/backend/notes/domain/value-object/Text.ts", 1, "The value object Text imports the port NoteRepository (src/backend/notes/domain/port/note-repository/NoteRepository.js), but an entity or a value object holds business rules, and never talks to a port. Let the handler call NoteRepository, and give Text the values it needs."]
    ]
  },

  { rule: "backend-use-case-shape", branch: "out of the folder of a use case", files: { "src/backend/notes/command/add-note.handler.ts": "export class AddNoteHandler {}\n" }, expected: [
      ["src/backend/notes/command/add-note.handler.ts", undefined, "add-note.handler.ts is in command/ but in no folder of a use case: command/ holds one folder per use case. Move it to src/backend/notes/command/add-note/add-note.handler.ts."]
    ] },
  { rule: "backend-use-case-shape", branch: "a name that does not start with its use case", files: { "src/backend/notes/command/add-note/add.handler.ts": "import type { AddNoteOutput } from \"./add-note.dto.js\";\nexport class AddNoteHandler { execute(): AddNoteOutput { return new AddNoteOutput(); } }\n" }, expected: [
      ["src/backend/notes/command/add-note/add.handler.ts", undefined, "add.handler.ts does not start with the name of its use case, add-note. Rename it add-note.handler.ts."]
    ] },
  { rule: "backend-use-case-shape", branch: "a test whose name says no layer, next to one controller", files: { "src/backend/notes/command/add-note/add-note.test.ts": "test();\n" }, expected: [
      ["src/backend/notes/command/add-note/add-note.test.ts", undefined, "add-note.test.ts is a test of the use case add-note, but its name does not say the layer that it tests. Rename it add-note.application.test.ts if it tests the handler, or add-note.http.presentation.test.ts if it tests the controller add-note.http.controller.ts."]
    ] },
  { rule: "backend-use-case-shape", branch: "a test whose name says no layer, without a controller", files: { "src/backend/notes/command/remove-note/remove-note.test.ts": "test();\n" }, expected: [
      ["src/backend/notes/command/remove-note/remove-note.test.ts", undefined, "remove-note.test.ts is a test of the use case remove-note, but its name does not say the layer that it tests. Rename it remove-note.application.test.ts if it tests the handler, or remove-note.{name}.presentation.test.ts if it tests the controller remove-note.{name}.controller.ts."]
    ] },
  {
    rule: "backend-use-case-shape", branch: "a test whose name says no layer, next to two controllers",
    files: {
      "src/backend/notes/command/add-note/add-note.test.ts": "test();\n",
      "src/backend/notes/command/add-note/add-note.form.controller.ts": 'import { Controller } from "@ingenioz-it/caits/messaging/Controller";\n\nexport class AddNoteFormController extends Controller {}\n'
    },
    expected: [
      ["src/backend/notes/command/add-note/add-note.test.ts", undefined, "add-note.test.ts is a test of the use case add-note, but its name does not say the layer that it tests. Rename it add-note.application.test.ts if it tests the handler, or add-note.form.presentation.test.ts if it tests the controller add-note.form.controller.ts, or add-note.http.presentation.test.ts if it tests the controller add-note.http.controller.ts."]
    ]
  },
  { rule: "backend-use-case-shape", branch: "another file", files: { "src/backend/notes/command/add-note/helpers.ts": "export const trim = (text: string) => text.trim();\n" }, expected: [
      ["src/backend/notes/command/add-note/helpers.ts", undefined, "helpers.ts is not a file of a use case: command/add-note/ holds add-note.dto.ts, add-note.handler.ts and add-note.application.test.ts, and its controllers add-note.{name}.controller.ts, each with its test add-note.{name}.presentation.test.ts. Move its code into add-note.handler.ts, or into src/backend/notes/domain/ if another use case needs it."]
    ] },
  { rule: "frontend-use-case-shape", branch: "a controller", files: { "src/frontend/notes/query/list-notes/list-notes.http.controller.ts": "export class ListNotesHttpController {}\n" }, expected: [
      ["src/frontend/notes/query/list-notes/list-notes.http.controller.ts", undefined, "list-notes.http.controller.ts is a controller, but a use case of the frontend has none: the store sends its DTOs to the message bus. Remove it, and let src/frontend/notes/presentation/store/notesStore.ts send the DTO of list-notes."]
    ] },
  { rule: "frontend-use-case-shape", branch: "an event", files: { "src/frontend/notes/query/list-notes/NotesLoaded.ts": 'export class NotesLoaded { readonly type = "notes.loaded" as const; }\n' }, expected: [
      ["src/frontend/notes/query/list-notes/NotesLoaded.ts", undefined, "NotesLoaded.ts is an event, but the events of a frontend context live in event/. Move it to src/frontend/notes/event/NotesLoaded.ts."]
    ] },
  { rule: "frontend-use-case-shape", branch: "out of the folder of a use case", files: { "src/frontend/notes/query/list-notes.dto.ts": "export class ListNotesQuery {}\n" }, expected: [
      ["src/frontend/notes/query/list-notes.dto.ts", undefined, "list-notes.dto.ts is in query/ but in no folder of a use case: query/ holds one folder per use case. Move it to src/frontend/notes/query/list-notes/list-notes.dto.ts."]
    ] },
  { rule: "frontend-use-case-shape", branch: "a name that does not start with its use case", files: { "src/frontend/notes/query/list-notes/list.handler.ts": "export class ListNotesHandler {}\n" }, expected: [
      ["src/frontend/notes/query/list-notes/list.handler.ts", undefined, "list.handler.ts does not start with the name of its use case, list-notes. Rename it list-notes.handler.ts."]
    ] },
  { rule: "frontend-use-case-shape", branch: "a test whose name says no layer", files: { "src/frontend/notes/query/list-notes/list-notes.test.ts": "test();\n" }, expected: [
      ["src/frontend/notes/query/list-notes/list-notes.test.ts", undefined, "list-notes.test.ts is a test of the use case list-notes, but its name does not say the layer that it tests. Rename it list-notes.application.test.ts."]
    ] },
  { rule: "frontend-use-case-shape", branch: "another file", files: { "src/frontend/notes/query/list-notes/helpers.ts": "export const trim = (text: string) => text.trim();\n" }, expected: [
      ["src/frontend/notes/query/list-notes/helpers.ts", undefined, "helpers.ts is not a file of a use case: query/list-notes/ holds list-notes.dto.ts, list-notes.handler.ts and list-notes.application.test.ts. Move its code into list-notes.handler.ts, or into src/frontend/notes/domain/ if another use case needs it."]
    ] },
  {
    rule: "use-cases-isolated", branch: "a controller that sends the DTO of another use case",
    files: { "src/backend/notes/query/list-notes/list-notes.http.controller.ts": 'import { AddNoteCommand } from "#context/command/add-note/add-note.dto.js";\n\nexport class ListNotesHttpController extends Controller { toDto() { return new AddNoteCommand(); } }\n' },
    expected: [
      ["src/backend/notes/query/list-notes/list-notes.http.controller.ts", 1, "The use case query/list-notes imports src/backend/notes/command/add-note/add-note.dto.js, a file of the use case command/add-note, but a use case imports nothing from another one: each changes, and goes, alone. Move this controller into src/backend/notes/command/add-note/, since a controller sends the DTO of its own use case."]
    ]
  },
  {
    rule: "use-cases-isolated", branch: "a handler that imports another use case",
    files: { "src/backend/notes/command/edit-note/edit-note.handler.ts": 'import "#context/command/add-note/add-note.handler.js";\n\nexport class EditNoteHandler { execute() { return new EditNoteOutput(); } }\n' },
    expected: [
      ["src/backend/notes/command/edit-note/edit-note.handler.ts", 1, "The use case command/edit-note imports src/backend/notes/command/add-note/add-note.handler.js, a file of the use case command/add-note, but a use case imports nothing from another one: each changes, and goes, alone. Move what they share into src/backend/notes/domain/."]
    ]
  },
  { rule: "use-cases-isolated", branch: "a use case of shared", files: { [handler]: 'import "#shared/command/announce/announce.dto.js";\n\nimport type { AddNoteOutput } from "./add-note.dto.js";\nexport class AddNoteHandler { execute(): AddNoteOutput { return new AddNoteOutput(); } }\n' }, expected: [
      ["src/backend/notes/command/add-note/add-note.handler.ts", 1, "The use case command/add-note imports src/backend/shared/command/announce/announce.dto.js, a file of the use case command/announce of shared, but a use case imports nothing from another one: each changes, and goes, alone. Move what they share into src/backend/notes/domain/."]
    ] },
  { rule: "handler-answers-output", branch: "a handler without execute", files: { [handler]: "export class AddNoteHandler {}\n" }, expected: [
      [handler, undefined, "add-note.handler.ts has no execute, but a backend handler answers with output DTOs, classes of the DTO file of its use case. Give execute the type of its answers, `Promise<AddMessageOutput>`, or `Promise<MessageAdded | MessageRefused>` for two, and declare each class in the DTO file."]
    ] },
  { rule: "handler-answers-output", branch: "an execute without a return type", files: { [handler]: "export class AddNoteHandler {\n  execute() { return new AddNoteOutput(); }\n}\n" }, expected: [
      [handler, 2, "AddNoteHandler.execute has no return type, but a backend handler answers with output DTOs, classes of the DTO file of its use case. Give execute the type of its answers, `Promise<AddMessageOutput>`, or `Promise<MessageAdded | MessageRefused>` for two, and declare each class in the DTO file."]
    ] },
  {
    rule: "handler-answers-output", branch: "an execute that answers with what is not a DTO",
    files: { [handler]: 'import type { Note } from "#context/domain/entity/Note.js";\nexport class AddNoteHandler { async execute(): Promise<Note | void> {} }\n' },
    expected: [[handler, 2, "AddNoteHandler.execute answers with `Note` and `void`, which are not DTOs of its use case, but a backend handler answers with output DTOs, classes of the DTO file of its use case. Give execute the type of its answers, `Promise<AddMessageOutput>`, or `Promise<MessageAdded | MessageRefused>` for two, and declare each class in the DTO file."]]
  },
  {
    rule: "handler-answers-output", branch: "one of its answers is not a DTO, in a class without a name",
    files: { [handler]: 'import type { AddNoteOutput } from "./add-note.dto.js";\nexport default class { execute(): AddNoteOutput | string[] { return []; } }\n' },
    expected: [[handler, 2, "Its execute answers with `string[]`, which is not a DTO of its use case, but a backend handler answers with output DTOs, classes of the DTO file of its use case. Give execute the type of its answers, `Promise<AddMessageOutput>`, or `Promise<MessageAdded | MessageRefused>` for two, and declare each class in the DTO file."]]
  },
  {
    rule: "handler-answers-output", branch: "several answers, each a DTO of the use case",
    files: { [handler]: 'import type { AddNoteOutput, NoteRefused } from "./add-note.dto.js";\nexport class AddNoteHandler { async execute(): Promise<AddNoteOutput | NoteRefused> { return new AddNoteOutput(); } }\n' },
    expected: []
  },
  { rule: "handler-answers-output", branch: "a handler of the frontend", files: { "src/frontend/notes/query/list-notes/list-notes.handler.ts": "export class ListNotesHandler { execute(): void {} }\n" }, expected: [] },
  { rule: "controller-extends-controller", branch: "a controller of another name than its file", files: { [controller]: 'import { Controller } from "@ingenioz-it/caits/messaging/Controller";\n\nexport class PostNoteController extends Controller {}\n' }, expected: [] },
  { rule: "controller-extends-controller", branch: "a class that extends nothing", files: { [controller]: "export class AddNoteHttpController {}\n" }, expected: [
      ["src/backend/notes/command/add-note/add-note.http.controller.ts", 1, "AddNoteHttpController extends nothing, but a controller is an exported class …Controller that extends the Controller of the kernel. Write `export class AddNoteHttpController extends Controller`, with Controller from @ingenioz-it/caits/messaging/Controller."]
    ] },
  { rule: "controller-extends-controller", branch: "a class that is not exported", files: { [controller]: 'import { Controller } from "@ingenioz-it/caits/messaging/Controller";\n\nclass AddNoteHttpController extends Controller {}\n' }, expected: [
      ["src/backend/notes/command/add-note/add-note.http.controller.ts", 3, "AddNoteHttpController is not exported, but a controller is an exported class …Controller that extends the Controller of the kernel. Write `export class AddNoteHttpController extends Controller`, with Controller from @ingenioz-it/caits/messaging/Controller."]
    ] },
  { rule: "controller-extends-controller", branch: "a class whose name does not end with Controller", files: { [controller]: 'import { Controller } from "@ingenioz-it/caits/messaging/Controller";\n\nexport class AddNoteHttp extends Controller {}\n' }, expected: [
      ["src/backend/notes/command/add-note/add-note.http.controller.ts", 3, "AddNoteHttp does not end with Controller, but a controller is an exported class …Controller that extends the Controller of the kernel. Write `export class AddNoteHttpController extends Controller`, with Controller from @ingenioz-it/caits/messaging/Controller."]
    ] },
  { rule: "controller-extends-controller", branch: "no class", files: { [controller]: "export const handle = () => null;\n" }, expected: [
      ["src/backend/notes/command/add-note/add-note.http.controller.ts", undefined, "add-note.http.controller.ts holds no exported class …Controller, but a controller is an exported class …Controller that extends the Controller of the kernel. Write `export class …Controller extends Controller`, with Controller from @ingenioz-it/caits/messaging/Controller."]
    ] },

  { rule: "frontend-event-shape", branch: "an event in a folder", files: { "src/frontend/notes/event/loaded/NotesLoaded.ts": 'export class NotesLoaded { readonly type = "notes.loaded" as const; }\n' }, expected: [
      ["src/frontend/notes/event/loaded/NotesLoaded.ts", undefined, "loaded/NotesLoaded.ts is not an event file: the events of a frontend context are in event/, one file per event, at its root. Move it to src/frontend/notes/event/NotesLoaded.ts."]
    ] },
  { rule: "event-file-exports-its-event", branch: "several exports", files: { "src/frontend/notes/event/NotesLoaded.ts": 'export class NotesLoaded { readonly type = "notes.loaded" as const; }\nexport const LIMIT = 10;\n' }, expected: [
      ["src/frontend/notes/event/NotesLoaded.ts", 2, "NotesLoaded.ts exports 2 names (NotesLoaded, LIMIT), but an event file exports only its event. Move LIMIT into NotesLoaded as a static member, or to a file of its own."]
    ] },
  { rule: "event-file-exports-its-event", branch: "no export", files: { "src/frontend/notes/event/NotesLoaded.ts": "class NotesLoaded {}\n" }, expected: [
      ["src/frontend/notes/event/NotesLoaded.ts", undefined, "NotesLoaded.ts exports nothing, but an event file exports its event. Write `export class … { readonly type = \"notes.…\" as const; }`."]
    ] },
  { rule: "event-file-exports-its-event", branch: "an event of another name than its file", files: { "src/frontend/notes/event/NotesLoaded.ts": 'export class Loaded { readonly type = "notes.loaded" as const; }\n' }, expected: [] },
  { rule: "event-file-exports-its-event", branch: "another kind", files: { "src/frontend/notes/event/NotesLoaded.ts": "export function NotesLoaded() {}\n" }, expected: [
      ["src/frontend/notes/event/NotesLoaded.ts", 1, "NotesLoaded.ts exports NotesLoaded as a function, but an event is a class, or a type that joins events. Write `export class NotesLoaded`."]
    ] },
  { rule: "event-type-names-context", branch: "another type", files: { "src/frontend/notes/event/NotesLoaded.ts": 'export class NotesLoaded {\n  readonly type = "notes.load" as const;\n}\n' }, expected: [
      ["src/frontend/notes/event/NotesLoaded.ts", 2, "The type of NotesLoaded is \"notes.load\", but it must be \"notes.loaded\": the name of its context, then the name of the event without the context, in kebab-case. Write `readonly type = \"notes.loaded\" as const`."]
    ] },
  { rule: "event-type-names-context", branch: "a type that is not a string", files: { "src/frontend/notes/event/NotesLoaded.ts": "export class NotesLoaded {\n  readonly type = 1;\n}\n" }, expected: [
      ["src/frontend/notes/event/NotesLoaded.ts", 2, "The type of NotesLoaded is not a string, but it must be \"notes.loaded\": the name of its context, then the name of the event without the context, in kebab-case. Write `readonly type = \"notes.loaded\" as const`."]
    ] },
  { rule: "event-type-names-context", branch: "a type that is not readonly", files: { "src/frontend/notes/event/NotesLoaded.ts": 'export class NotesLoaded {\n  type = "notes.loaded" as const;\n}\n' }, expected: [
      ["src/frontend/notes/event/NotesLoaded.ts", 2, "The type of NotesLoaded is not readonly, so the store cannot tell the events apart. Write `readonly type = \"notes.loaded\" as const`."]
    ] },
  { rule: "event-type-names-context", branch: "a type that is not as const", files: { "src/frontend/notes/event/NotesLoaded.ts": 'export class NotesLoaded {\n  readonly type = "notes.loaded";\n}\n' }, expected: [
      ["src/frontend/notes/event/NotesLoaded.ts", 2, "The type of NotesLoaded is not as const, so the store cannot tell the events apart. Write `readonly type = \"notes.loaded\" as const`."]
    ] },
  { rule: "event-type-names-context", branch: "a type that is neither readonly nor as const", files: { "src/frontend/notes/event/NotesLoaded.ts": 'export class NotesLoaded {\n  type = "notes.loaded";\n}\n' }, expected: [
      ["src/frontend/notes/event/NotesLoaded.ts", 2, "The type of NotesLoaded is neither readonly nor as const, so the store cannot tell the events apart. Write `readonly type = \"notes.loaded\" as const`."]
    ] },
  { rule: "event-type-names-context", branch: "no type", files: { "src/frontend/notes/event/NotesLoaded.ts": "\nexport class NotesLoaded {}\n" }, expected: [
      ["src/frontend/notes/event/NotesLoaded.ts", 2, "NotesLoaded has no type, so the store cannot tell it from the other events. Add `readonly type = \"notes.loaded\" as const`."]
    ] },

  {
    rule: "frontend-presentation-shape", branch: "at the root of the presentation, used by one view",
    files: {
      "src/frontend/notes/presentation/helpers.ts": "export const trim = (text: string) => text.trim();\n",
      "src/frontend/notes/presentation/view/notes-feed/notesFeed.ts": `import "#context/presentation/helpers.js";\n${project["src/frontend/notes/presentation/view/notes-feed/notesFeed.ts"]}`
    },
    expected: [
      ["src/frontend/notes/presentation/helpers.ts", undefined, "helpers.ts is at the root of the presentation, which holds only NotesFrontend.ts besides view/, component/ and store/. Move it into the folder of the view that uses it, view/notes-feed/, or into a component of component/ if several views share it."]
    ]
  },
  { rule: "frontend-presentation-shape", branch: "at the root of the presentation, used by no view", files: { "src/frontend/notes/presentation/helpers.ts": "export const trim = (text: string) => text.trim();\n" }, expected: [
      ["src/frontend/notes/presentation/helpers.ts", undefined, "helpers.ts is at the root of the presentation, which holds only NotesFrontend.ts besides view/, component/ and store/. Move it into the folder of the view that uses it, or into a component of component/ if several views share it."]
    ] },
  { rule: "frontend-presentation-shape", branch: "in store/", files: { "src/frontend/notes/presentation/store/store.ts": "export default {};\n" }, expected: [
      ["src/frontend/notes/presentation/store/store.ts", undefined, "store.ts is in store/, but the store of the context is store/notesStore.ts. Rename it notesStore.ts, or move its code into the store."]
    ] },
  { rule: "frontend-presentation-shape", branch: "directly in view/", files: { "src/frontend/notes/presentation/view/NotesList.marko": "<p>Notes</p>\n" }, expected: [
      ["src/frontend/notes/presentation/view/NotesList.marko", undefined, "NotesList.marko is in view/ but in no folder of a view: view/ holds one folder each. Move it to view/notes-list/NotesList.marko."]
    ] },
  { rule: "frontend-presentation-shape", branch: "in a folder of a view that is not in kebab-case", files: { "src/frontend/notes/presentation/view/NotesList/NotesList.marko": "<p>Notes</p>\n" }, expected: [
      ["src/frontend/notes/presentation/view/NotesList/NotesList.marko", undefined, "view/NotesList/NotesList.marko is not in a folder of a view: view/ holds one folder per view, named in kebab-case. Move it to src/frontend/notes/presentation/view/notes-list/NotesList.marko."]
    ] },
  { rule: "frontend-presentation-shape", branch: "in another folder", files: { "src/frontend/notes/presentation/page/Home.marko": "<p>Notes</p>\n" }, expected: [
      ["src/frontend/notes/presentation/page/Home.marko", undefined, "page/Home.marko is in presentation/page/, but the presentation holds only view/, component/, store/ and NotesFrontend.ts, and the pages live in src/routes/_frontend/. Move a page to src/routes/_frontend/, and the rest into a view or a component."]
    ] },
  { rule: "zod-in-presentation", branch: "in the backend", files: { [backendAdapter]: `import { z } from "zod";\n${project[backendAdapter]}` }, expected: [
      ["src/backend/notes/infra/note-repository/in-memory-note-repository.ts", 1, "The infra imports zod, but in the backend only the controllers check data with zod. Check the data in the controller that receives it, and give the infra typed values."]
    ] },
  { rule: "zod-in-presentation", branch: "in the frontend", files: { "src/frontend/notes/di.ts": `import "zod";\n${project["src/frontend/notes/di.ts"]}` }, expected: [
      ["src/frontend/notes/di.ts", 1, "This di.ts imports zod, but in the frontend only the presentation and the adapters of the infra check data with zod. Check the data where it comes in, and give di.ts typed values."]
    ] },
  { rule: "zod-in-presentation", branch: "in the infra of the frontend", files: { [frontendAdapter]: `import "zod";\n${project[frontendAdapter]}` }, expected: [] },
  { rule: "zod-in-presentation", branch: "in a layer with a list", packages: { ...allowed, infra: ["zod"] }, files: { [backendAdapter]: `import "zod";\n${project[backendAdapter]}` }, expected: [] },
  { rule: "marko-in-frontend-presentation", branch: "in the frontend", files: { [frontendAdapter]: `import "marko";\n${project[frontendAdapter]}` }, expected: [
      ["src/frontend/notes/infra/notes-gateway/http-notes-gateway.ts", 1, "The infra imports marko, but only the presentation of the frontend and the routes use Marko. Move the template into a view of src/frontend/notes/presentation/view/, and give the view its data as input."]
    ] },
  { rule: "marko-in-frontend-presentation", branch: "in the backend", files: { [backendAdapter]: `import "marko";\n${project[backendAdapter]}` }, expected: [
      ["src/backend/notes/infra/note-repository/in-memory-note-repository.ts", 1, "The backend imports marko, but only the presentation of the frontend and the routes use Marko. Move the template into a view of a frontend context, which gets its data from the HTTP API of the backend."]
    ] },
  { rule: "marko-in-frontend-presentation", branch: "a view, which the rules on the layers check", files: { [frontendAdapter]: `import "#context/presentation/view/notes-block/NotesBlock.marko";\n${project[frontendAdapter]}` }, expected: [] },
  {
    rule: "dtos-sent-by-store", branch: "a DTO that the file names",
    files: { "src/frontend/notes/presentation/view/notes-block/loadNotesBlock.ts": 'import { ListNotesQuery } from "#context/query/list-notes/list-notes.dto.js";\n\nexport const query = () => new ListNotesQuery();\n' }, expected: [
      ["src/frontend/notes/presentation/view/notes-block/loadNotesBlock.ts", 1, "This file imports ListNotesQuery (src/frontend/notes/query/list-notes/list-notes.dto.js), an input DTO of the use case query/list-notes, but in the frontend only the store sends input DTOs. Publish an event of notes instead, and let src/frontend/notes/presentation/store/notesStore.ts turn it into ListNotesQuery."]
    ]
  },
  { rule: "dtos-sent-by-store", branch: "a DTO that the file does not name", files: { "src/frontend/notes/presentation/view/notes-block/loadNotesBlock.ts": 'import "#context/query/list-notes/list-notes.dto.js";\n' }, expected: [
      ["src/frontend/notes/presentation/view/notes-block/loadNotesBlock.ts", 1, "This file imports src/frontend/notes/query/list-notes/list-notes.dto.js, an input DTO of the use case query/list-notes, but in the frontend only the store sends input DTOs. Publish an event of notes instead, and let src/frontend/notes/presentation/store/notesStore.ts turn it into its DTO."]
    ] },
  { rule: "events-built-with-new", branch: "an event that a class gives", files: { "src/frontend/notes/presentation/view/notes-block/loadNotesBlock.ts": '\nexport const requested = { type: "notes.requested" };\n' }, expected: [
      ["src/frontend/notes/presentation/view/notes-block/loadNotesBlock.ts", 2, "This file builds the event \"notes.requested\" as an object literal, so nothing checks its type or its data. Build it with `new NotesRequested(…)`, from src/frontend/notes/event/NotesRequested.ts."]
    ] },
  { rule: "events-built-with-new", branch: "an event that no class gives", files: { "src/frontend/notes/presentation/view/notes-block/loadNotesBlock.ts": 'export const refreshed = { type: "notes.refreshed" };\n' }, expected: [
      ["src/frontend/notes/presentation/view/notes-block/loadNotesBlock.ts", 1, "This file builds the event \"notes.refreshed\" as an object literal, so nothing checks its type or its data. Write the class NotesRefreshed, with `readonly type = \"notes.refreshed\" as const`, in a file of its own in src/frontend/notes/event/, and build the event with `new NotesRefreshed(…)`."]
    ] },
  { rule: "views-take-own-frontend", branch: "the frontend of another context", files: { "src/frontend/notes/presentation/view/notes-block/NotesBlock.marko": '<button onClick() { frontendOf($global, "alerts"); }>Charger</button>\n' }, expected: [
      ["src/frontend/notes/presentation/view/notes-block/NotesBlock.marko", 1, "This view of notes takes the frontend of alerts, but a view or a component takes only the frontend of its own context. Publish an event of notes instead, and share it as an event of shared in src/frontend/notes/context-map.ts: the context map of alerts turns it into an event of its own."]
    ] },
  { rule: "views-take-own-frontend", branch: "the frontend of shared", files: { "src/frontend/notes/presentation/view/notes-block/NotesBlock.marko": '<button onClick() { frontendOf($global, "shared"); }>Choisir</button>\n' }, expected: [
      ["src/frontend/notes/presentation/view/notes-block/NotesBlock.marko", 1, "This view of notes takes the frontend of shared, but a view or a component takes only the frontend of its own context. Publish an event of notes instead, and share it as an event of shared in src/frontend/notes/context-map.ts."]
    ] },
  { rule: "views-take-own-frontend", branch: "a component of shared", files: { "src/frontend/shared/presentation/component/badge/index.marko": '<button onClick() { frontendOf($global, "notes"); }>Choisir</button>\n' }, expected: [
      ["src/frontend/shared/presentation/component/badge/index.marko", 1, "This component of shared takes the frontend of notes, but a view or a component takes only the frontend of its own context. Publish an event of shared instead: the context map of notes turns it into an event of its own."]
    ] },
  { rule: "views-take-own-frontend", branch: "the store", files: { [store]: `${project[store]}export const other = () => frontendOf($global, "alerts");\n` }, expected: [
      ["src/frontend/notes/presentation/store/notesStore.ts", 4, "This file of notes takes the frontend of alerts, but a view or a component takes only the frontend of its own context. Publish an event of notes instead, and share it as an event of shared in src/frontend/notes/context-map.ts: the context map of alerts turns it into an event of its own."]
    ] },
  {
    rule: "components-import-no-view", branch: "a component that imports a view",
    files: { "src/frontend/notes/presentation/component/note-label/NoteLabel.marko": 'import "#context/presentation/view/notes-block/NotesBlock.marko";\n\n<p>Notes</p>\n' }, expected: [
      ["src/frontend/notes/presentation/component/note-label/NoteLabel.marko", 1, "The component note-label imports src/frontend/notes/presentation/view/notes-block/NotesBlock.marko, a file of the view notes-block, but a component imports no view: the views place the components. Move what they both need into the component note-label, and let a route place the view notes-block."]
    ]
  },
  {
    rule: "views-import-no-view", branch: "a view that imports another view",
    files: { "src/frontend/notes/presentation/view/notes-count/NotesCount.marko": 'import NotesBlock from "#context/presentation/view/notes-block/NotesBlock.marko";\n\n<NotesBlock/>\n' }, expected: [
      ["src/frontend/notes/presentation/view/notes-count/NotesCount.marko", 1, "The view notes-count imports src/frontend/notes/presentation/view/notes-block/NotesBlock.marko, a file of the view notes-block, but a view imports nothing from another view. Move what they share into a component of src/frontend/notes/presentation/component/, and let the route place the two views side by side."]
    ]
  },

  { rule: "backend-infra-shape", branch: "an adapter not named after its port", files: { "src/backend/notes/infra/note-repository/memory.ts": "export class Memory implements NoteRepository {}\n" }, expected: [
      ["src/backend/notes/infra/note-repository/memory.ts", undefined, "memory.ts is in infra/note-repository/, but an adapter is named after its implementation and its port: {implementation}-note-repository.ts. Rename it memory-note-repository.ts."]
    ] },
  { rule: "backend-infra-shape", branch: "a test not named after its port", files: { "src/backend/notes/infra/note-repository/memory.test.ts": "test();\n" }, expected: [
      ["src/backend/notes/infra/note-repository/memory.test.ts", undefined, "memory.test.ts is in infra/note-repository/, but an adapter is named after its implementation and its port: {implementation}-note-repository.ts. Rename it memory-note-repository.test.ts."]
    ] },
  { rule: "backend-infra-shape", branch: "an adapter named after its port only", files: { "src/backend/notes/infra/note-repository/note-repository.ts": "export class Repository implements NoteRepository {}\n" }, expected: [
      ["src/backend/notes/infra/note-repository/note-repository.ts", undefined, "note-repository.ts is in infra/note-repository/, but an adapter is named after its implementation and its port: {implementation}-note-repository.ts. Rename it {implementation}-note-repository.ts."]
    ] },
  { rule: "backend-infra-shape", branch: "an adapter out of the folder of its port", files: { "src/backend/notes/infra/memory.ts": 'import type { NoteRepository } from "#context/domain/port/note-repository/NoteRepository.js";\n\nexport class Memory implements NoteRepository {}\n' }, expected: [
      ["src/backend/notes/infra/memory.ts", undefined, "infra/memory.ts is in no folder of a port: the infra holds one folder per port, infra/{port}/. Move it into the folder of the port that it implements, src/backend/notes/infra/note-repository/."]
    ] },
  { rule: "backend-infra-shape", branch: "a file out of the folders of the ports", files: { "src/backend/notes/infra/helpers.ts": "export const trim = (text: string) => text.trim();\n" }, expected: [
      ["src/backend/notes/infra/helpers.ts", undefined, "infra/helpers.ts is in no folder of a port: the infra holds one folder per port, infra/{port}/. Move it into the folder of the port that it implements."]
    ] },
  { rule: "infra-folder-implements-port", branch: "a folder without its port", files: { "src/backend/notes/infra/clock/system-clock.ts": "export class SystemClock implements Clock {}\n" }, expected: [
      ["src/backend/notes/infra/clock/system-clock.ts", undefined, "infra/clock/ is the folder of a port, but the domain has no port in domain/port/clock/. Write the port in src/backend/notes/domain/port/clock/, or move the adapter into the folder of the port that it implements."]
    ] },
  {
    rule: "infra-folder-implements-port", branch: "an adapter of a port of another folder",
    files: { "src/backend/notes/infra/storage/file-storage.ts": 'import type { NoteRepository } from "#context/domain/port/note-repository/NoteRepository.js";\n\nexport class FileNoteRepository implements NoteRepository {}\n' }, expected: [
      ["src/backend/notes/infra/storage/file-storage.ts", undefined, "FileNoteRepository implements NoteRepository, but it is in infra/storage/, and the domain has no port in domain/port/storage/. Move it to src/backend/notes/infra/note-repository/."]
    ]
  },
  { rule: "adapter-implements-port", branch: "a class that implements nothing", files: { "src/backend/notes/infra/note-repository/file-note-repository.ts": "export class FileNoteRepository {}\n" }, expected: [
      ["src/backend/notes/infra/note-repository/file-note-repository.ts", 1, "FileNoteRepository does not implement NoteRepository, the port of infra/note-repository/. Write `export class FileNoteRepository implements NoteRepository`, with `import type { NoteRepository } from \"#context/domain/port/note-repository/NoteRepository.js\"`."]
    ] },
  { rule: "adapter-implements-port", branch: "a class that implements another port", files: { "src/backend/notes/infra/note-repository/file-note-repository.ts": "export class FileNoteRepository implements Storage {}\n" }, expected: [
      ["src/backend/notes/infra/note-repository/file-note-repository.ts", 1, "FileNoteRepository does not implement NoteRepository, the port of infra/note-repository/; it implements Storage. Write `export class FileNoteRepository implements NoteRepository`, with `import type { NoteRepository } from \"#context/domain/port/note-repository/NoteRepository.js\"`."]
    ] },
  {
    rule: "adapter-implements-port", branch: "the port of its folder, under another name",
    files: { "src/backend/notes/infra/note-repository/file-note-repository.ts": 'import type { NoteRepository as Notes } from "#context/domain/port/note-repository/NoteRepository.js";\n\nexport class FileNoteRepository implements Notes {}\n' },
    expected: []
  },
  {
    rule: "adapter-implements-port", branch: "an interface of the same name as the port, from another module",
    files: { "src/backend/notes/infra/note-repository/file-note-repository.ts": 'interface NoteRepository {}\n\nexport class FileNoteRepository implements NoteRepository {}\n' },
    expected: [["src/backend/notes/infra/note-repository/file-note-repository.ts", 3, 'FileNoteRepository implements a NoteRepository that is not the port of infra/note-repository/, from src/backend/notes/domain/port/note-repository/NoteRepository.ts. Implement the port, with `import type { NoteRepository } from "#context/domain/port/note-repository/NoteRepository.js"`.']]
  },
  { rule: "adapter-implements-port", branch: "no class", files: { "src/backend/notes/infra/note-repository/file-note-repository.ts": "export const repository = {};\n" }, expected: [
      ["src/backend/notes/infra/note-repository/file-note-repository.ts", undefined, "file-note-repository.ts holds no class, but an adapter of infra/note-repository/ is a class that implements NoteRepository. Write `export class … implements NoteRepository`, with `import type { NoteRepository } from \"#context/domain/port/note-repository/NoteRepository.js\"`."]
    ] },
  { rule: "adapter-test-runs-contract", branch: "a test that runs no contract", files: { "src/backend/notes/infra/note-repository/file-note-repository.test.ts": "test();\n" }, expected: [
      ["src/backend/notes/infra/note-repository/file-note-repository.test.ts", undefined, "This test does not run the contract of NoteRepository, so nothing proves that file-note-repository.ts does what every adapter of NoteRepository does. Import describeNoteRepositoryContract from \"#context/domain/port/note-repository/NoteRepository.contract.js\", and call it with a factory of the adapter."]
    ] },
  {
    rule: "adapter-test-runs-contract", branch: "a test next to its adapter",
    files: { "src/backend/notes/infra/note-repository/in-memory-note-repository.test.ts": "test();\n" }, expected: [
      ["src/backend/notes/infra/note-repository/in-memory-note-repository.test.ts", undefined, "This test does not run the contract of NoteRepository, so nothing proves that InMemoryNoteRepository does what every adapter of NoteRepository does. Import describeNoteRepositoryContract from \"#context/domain/port/note-repository/NoteRepository.contract.js\", and call it with a factory of InMemoryNoteRepository."]
    ]
  },

  { rule: "di-holds-bindings", branch: "an item that builds an adapter", files: { "src/backend/notes/di.ts": "export default [new InMemoryNoteRepository()];\n" }, expected: [
      ["src/backend/notes/di.ts", 1, "The item `new InMemoryNoteRepository()` is not a binding, but a di.ts only binds: the kernel builds the dependencies. Write it `bind(NoteRepository).to(InMemoryNoteRepository)`."]
    ] },
  { rule: "di-holds-bindings", branch: "a binding without its adapter", files: { "src/backend/notes/di.ts": "export default [\n  bind(NoteRepository)\n];\n" }, expected: [
      ["src/backend/notes/di.ts", 2, "The item `bind(NoteRepository)` is not a binding, but a di.ts only binds: the kernel builds the dependencies. Write it `bind(NoteRepository).to(Adapter)`."]
    ] },
  { rule: "di-holds-bindings", branch: "an item that is no binding", files: { "src/backend/notes/di.ts": "export default [makeRepository()];\n" }, expected: [
      ["src/backend/notes/di.ts", 1, "The item `makeRepository()` is not a binding, but a di.ts only binds: the kernel builds the dependencies. Write it `bind(Port).to(Adapter)`."]
    ] },
  { rule: "di-holds-bindings", branch: "several exports", files: { "src/backend/notes/di.ts": "export const repository = 1;\nexport default [];\n" }, expected: [
      ["src/backend/notes/di.ts", 1, "di.ts exports 2 names (repository, default), but a di.ts has one export, the list of its bindings. Write `export default [bind(Port).to(Adapter), …]`, and nothing else."]
    ] },
  { rule: "di-holds-bindings", branch: "an export that is no list", files: { "src/backend/notes/di.ts": "export default {};\n" }, expected: [
      ["src/backend/notes/di.ts", 1, "di.ts exports no list, but a di.ts has one export, the list of its bindings. Write `export default [bind(Port).to(Adapter), …]`, and nothing else."]
    ] },
  { rule: "di-holds-bindings", branch: "no export", files: { "src/backend/notes/di.ts": "const bindings = [];\n" }, expected: [
      ["src/backend/notes/di.ts", undefined, "di.ts exports no list, but a di.ts has one export, the list of its bindings. Write `export default [bind(Port).to(Adapter), …]`, and nothing else."]
    ] },
  { rule: "di-read-by-kernel", branch: "a handler that imports the di.ts", files: { [handler]: 'import "#context/di.js";\n\nimport type { AddNoteOutput } from "./add-note.dto.js";\nexport class AddNoteHandler { execute(): AddNoteOutput { return new AddNoteOutput(); } }\n' }, expected: [
      ["src/backend/notes/command/add-note/add-note.handler.ts", 1, "This file imports src/backend/notes/di.js, the di.ts of notes, but only the kernel reads a di.ts. Depend on the port that it needs instead, and the kernel gives it the adapter that di.ts binds."]
    ] },

  { rule: "sides-hold-contexts", branch: "a context map of the whole backend", files: { "src/backend/context-map.ts": "export default [];\n" }, expected: [
      ["src/backend/context-map.ts", undefined, "src/backend/context-map.ts is not in a context, but src/backend holds only its contexts, and the integration tests of the whole backend (*.integration.test.ts). Move each of its lines into the context map of the context that reacts, src/backend/{context}/context-map.ts."]
    ] },
  { rule: "sides-hold-contexts", branch: "a test of the whole backend", files: { "src/backend/notes.test.ts": "test();\n" }, expected: [
      ["src/backend/notes.test.ts", undefined, "notes.test.ts is a test of the whole backend, but its name does not say so. Rename it notes.integration.test.ts, or move it into the context that it tests."]
    ] },
  { rule: "sides-hold-contexts", branch: "another file of the backend", files: { "src/backend/helpers.ts": "export const trim = (text: string) => text.trim();\n" }, expected: [
      ["src/backend/helpers.ts", undefined, "helpers.ts is in src/backend but in no context: src/backend holds only its contexts, and the integration tests of the whole backend (*.integration.test.ts). Move it into the context that it belongs to, such as src/backend/notes/ or src/backend/shared/."]
    ] },
  { rule: "sides-hold-contexts", branch: "a file of the frontend", files: { "src/frontend/helpers.ts": "export const trim = (text: string) => text.trim();\n" }, expected: [
      ["src/frontend/helpers.ts", undefined, "helpers.ts is in src/frontend but in no context: src/frontend holds only its contexts. Move it into the context that it belongs to, such as src/frontend/notes/ or src/frontend/shared/."]
    ] },
  { rule: "context-content", branch: "a file in no folder of a backend context", files: { "src/backend/notes/helpers.ts": "export const trim = (text: string) => text.trim();\n" }, expected: [
      ["src/backend/notes/helpers.ts", undefined, "helpers.ts is in no folder of its context: a context of the backend holds domain/, infra/, command/ and query/, with di.ts, test.di.ts and context-map.ts. Move its code into the domain if it holds business rules, into the use case that needs it, or into infra/, behind a port, if it talks to the outside world."]
    ] },
  { rule: "context-content", branch: "a file in no folder of a frontend context", files: { "src/frontend/notes/helpers.ts": "export const trim = (text: string) => text.trim();\n" }, expected: [
      ["src/frontend/notes/helpers.ts", undefined, "helpers.ts is in no folder of its context: a context of the frontend holds domain/, infra/, command/, query/, event/ and presentation/, with di.ts, test.di.ts and context-map.ts. Move its code into the domain if it holds business rules, into the use case that needs it, or into infra/, behind a port, if it talks to the outside world."]
    ] },
  { rule: "context-content", branch: "an event in application/", files: { "src/frontend/notes/application/event/NotesLoaded.ts": 'export class NotesLoaded { readonly type = "notes.loaded" as const; }\n' }, expected: [
      ["src/frontend/notes/application/event/NotesLoaded.ts", undefined, "application/event/NotesLoaded.ts is in application/, but a context holds its use cases at its root, in command/ and query/, and the events of the frontend in event/. Move it to src/frontend/notes/event/NotesLoaded.ts."]
    ] },
  { rule: "context-content", branch: "a use case in application/", files: { "src/backend/notes/application/command/add-note/add-note.handler.ts": "export class Moved {}\n" }, expected: [
      ["src/backend/notes/application/command/add-note/add-note.handler.ts", undefined, "application/command/add-note/add-note.handler.ts is in application/, but a context holds its use cases at its root, in command/ and query/, and the events of the frontend in event/. Move it to src/backend/notes/command/add-note/add-note.handler.ts."]
    ] },
  { rule: "context-map-translates-shared", branch: "a frontend map that imports a handler", files: { "src/frontend/notes/context-map.ts": 'import "#context/query/list-notes/list-notes.handler.js";\n\nexport default [];\n' }, expected: [
      ["src/frontend/notes/context-map.ts", 1, "The context map imports src/frontend/notes/query/list-notes/list-notes.handler.js, a handler, but a context map of the frontend only translates: it imports events and the values of the domain. Give an event of notes from the line instead: the store and the handlers hear it."]
    ] },
  { rule: "context-map-translates-shared", branch: "a backend map that imports a handler", files: { [contextMap]: `import "#context/command/add-note/add-note.handler.js";\n${project[contextMap]}` }, expected: [
      ["src/backend/notes/context-map.ts", 1, "The context map imports src/backend/notes/command/add-note/add-note.handler.js, a handler, but a context map only translates: it imports events, the input DTOs of its context, and the values of the domain. Import the input DTO from src/backend/notes/command/add-note/add-note.dto.js instead, and give it from the line: the kernel sends it to the handler."]
    ] },
  { rule: "context-map-translates-shared", branch: "a backend map that imports an adapter", files: { [contextMap]: `import "#context/infra/note-repository/in-memory-note-repository.js";\n${project[contextMap]}` }, expected: [
      ["src/backend/notes/context-map.ts", 1, "The context map imports src/backend/notes/infra/note-repository/in-memory-note-repository.js, an adapter, but a context map only translates: it imports events, the input DTOs of its context, and the values of the domain. Remove the import, and give an event or an input DTO from the line."]
    ] },
  {
    rule: "context-map-holds-lines", branch: "its lines by name",
    files: { "src/frontend/notes/context-map.ts": 'import { when } from "@ingenioz-it/caits/messaging/FrontendContextMap";\nimport { LabelChosen } from "#frontend-shared/event/LabelChosen.js";\nimport { NotesRequested } from "#context/event/NotesRequested.js";\n\nexport const lines = [when(LabelChosen, () => [new NotesRequested()])];\n' },
    expected: [
      ["src/frontend/notes/context-map.ts", 5, "The context map exports its lines by name, lines, but a context map has one export, the list of its lines. Write `export default [when(Event, event => […]), share(Event, event => […])]`, and nothing else."]
    ]
  },
  { rule: "context-map-holds-lines", branch: "several exports", files: { "src/frontend/notes/context-map.ts": `${FRONTEND_MAP_IMPORTS}\nexport const LINES = 2;\nexport default [when(LabelChosen, () => [new NotesRequested()]), share(NoteLabelChosen, () => [new LabelChosen()])];\n` }, expected: [
      ["src/frontend/notes/context-map.ts", 6, "The context map exports 2 names (LINES, default), but a context map has one export, the list of its lines. Write `export default [when(Event, event => […]), share(Event, event => […])]`, and nothing else."]
    ] },
  { rule: "context-map-holds-lines", branch: "no export", files: { "src/frontend/notes/context-map.ts": FRONTEND_MAP_IMPORTS }, expected: [
      ["src/frontend/notes/context-map.ts", undefined, "The context map exports nothing, but a context map has one export, the list of its lines. Write `export default [when(Event, event => […]), share(Event, event => […])]`, and nothing else."]
    ] },
  { rule: "context-map-holds-lines", branch: "a default that is not a list", files: { "src/frontend/notes/context-map.ts": `${FRONTEND_MAP_IMPORTS}\nexport default {};\n` }, expected: [
      ["src/frontend/notes/context-map.ts", 6, "The context map exports a default that is not a list, but a context map has one export, the list of its lines. Write `export default [when(Event, event => […]), share(Event, event => […])]`, and nothing else."]
    ] },
  { rule: "context-map-holds-lines", branch: "an item that is not a line", files: { [contextMap]: `${project[contextMap].replace("export default [", "export default [...[], ")}` }, expected: [
      ["src/backend/notes/context-map.ts", 7, "The item `...[]` is not a line: each line of a context map is made with when(…) or share(…). Write it `when(SharedEvent, event => […])` to hear an event of shared, or `share(OwnEvent, event => […])` to share an event of notes."]
    ] },
  { rule: "context-map-holds-lines", branch: "when and share of the other side", files: { [contextMap]: `${FRONTEND_MAP_IMPORTS}\nexport default [];\n` }, expected: [
      ["src/backend/notes/context-map.ts", 1, "The context map takes share from @ingenioz-it/caits/messaging/FrontendContextMap, but a context map of the backend takes it from @ingenioz-it/caits/messaging/ContextMap. Import share from @ingenioz-it/caits/messaging/ContextMap."],
      ["src/backend/notes/context-map.ts", 1, "The context map takes when from @ingenioz-it/caits/messaging/FrontendContextMap, but a context map of the backend takes it from @ingenioz-it/caits/messaging/ContextMap. Import when from @ingenioz-it/caits/messaging/ContextMap."]
    ] },
  {
    rule: "context-map-line-direction", branch: "the lines of the backend that go the wrong way",
    files: { [contextMap]: `${BACKEND_MAP_IMPORTS}\nexport default [\n  when(NoteAdded, () => [new AddNoteCommand()]),\n  share(NotePosted, () => [new UserJoined()]),\n  share(NoteAdded, () => [new AddNoteCommand()]),\n  when(UserJoined, () => [new NotePosted()])\n];\n` },
    expected: [
      ["src/backend/notes/context-map.ts", 8, "The line `when(NoteAdded, …)` starts from NoteAdded, an event of notes, but when(…) hears an event of shared, from the shared bus: this line never runs. Write it `share(NoteAdded, …)` to share it, or hear an event of src/backend/shared/domain/event/."],
      ["src/backend/notes/context-map.ts", 9, "The line `share(NotePosted, …)` starts from NotePosted, an event of shared, but share(…) starts from an event of notes: this line never runs. Write it `when(NotePosted, …)` to react to NotePosted, or start it from an event of src/backend/notes/domain/event/."],
      ["src/backend/notes/context-map.ts", 10, "The line `share(NoteAdded, …)` gives AddNoteCommand, which is not an event of shared, but share(…) gives events of shared. Give an event of src/backend/shared/domain/event/ instead."],
      ["src/backend/notes/context-map.ts", 11, "The line `when(UserJoined, …)` gives NotePosted, which is not an input DTO of notes, but when(…) gives what its context reacts to. Give an input DTO of src/backend/notes/command/ or src/backend/notes/query/ instead."]
    ]
  },
  {
    rule: "context-map-line-direction", branch: "a line of the frontend that gives an event of shared",
    files: { "src/frontend/notes/context-map.ts": `${FRONTEND_MAP_IMPORTS}\nexport default [when(LabelChosen, () => [new LabelChosen()]), share(NoteLabelChosen, () => [new LabelChosen()])];\n` }, expected: [
      ["src/frontend/notes/context-map.ts", 6, "The line `when(LabelChosen, …)` gives LabelChosen, which is not an event of notes, but when(…) gives what its context reacts to. Give an event of src/frontend/notes/event/ instead."]
    ]
  },
  {
    rule: "context-map-line-direction", branch: "lines whose event is no event",
    files: { "src/frontend/notes/context-map.ts": `${FRONTEND_MAP_IMPORTS}import { Label } from "#frontend-shared/domain/value-object/Label.js";\n\nexport default [when(Label, () => []), share(Label, () => [])];\n` }, expected: [
      ["src/frontend/notes/context-map.ts", 7, "The line `when(Label, …)` starts from Label, which is not an event of shared: this line never runs. Hear an event of src/frontend/shared/event/."],
      ["src/frontend/notes/context-map.ts", 7, "The line `share(Label, …)` starts from Label, which is not an event of notes: this line never runs. Start it from an event of src/frontend/notes/event/."]
    ]
  },
  {
    rule: "context-maps-without-cycle", branch: "a cycle in one map",
    files: { "src/frontend/notes/context-map.ts": `${FRONTEND_MAP_IMPORTS}\nexport default [\n  when(LabelChosen, () => [new NoteLabelChosen()]),\n  share(NoteLabelChosen, () => [new LabelChosen()])\n];\n` }, expected: [
      ["src/frontend/notes/context-map.ts", 7, "The context maps of the frontend make a cycle of events, NoteLabelChosen → LabelChosen → NoteLabelChosen, which the buses would carry without end, and the page would stop. Remove one of its lines: NoteLabelChosen → LabelChosen in src/frontend/notes/context-map.ts, or LabelChosen → NoteLabelChosen in src/frontend/notes/context-map.ts."]
    ]
  },
  { rule: "shared-events-in-map", branch: "a handler of the backend", files: { [handler]: 'import { NotePosted } from "#shared/domain/event/NotePosted.js";\n\nexport class AddNoteHandler { execute() { return new AddNoteOutput(new NotePosted()); } }\n' }, expected: [
      ["src/backend/notes/command/add-note/add-note.handler.ts", 1, "This file imports NotePosted (src/backend/shared/domain/event/NotePosted.js), an event of shared, but in a context other than shared only the context map names the events of shared. Publish an event of notes instead, in src/backend/notes/domain/event/, and share it as NotePosted in src/backend/notes/context-map.ts."]
    ] },
  { rule: "shared-events-in-map", branch: "a handler of the frontend", files: { "src/frontend/notes/query/list-notes/list-notes.handler.ts": 'import "#frontend-shared/event/LabelChosen.js";\n\nexport class ListNotesHandler {}\n' }, expected: [
      ["src/frontend/notes/query/list-notes/list-notes.handler.ts", 1, "This file imports src/frontend/shared/event/LabelChosen.js, an event of shared, but in a context other than shared only the context map names the events of shared. Publish an event of notes instead, in src/frontend/notes/event/, and share it as an event of shared in src/frontend/notes/context-map.ts."]
    ] },
  { rule: "shared-hears-no-context", branch: "a context map of shared", files: { "src/frontend/shared/context-map.ts": "export default [];\n" }, expected: [
      ["src/frontend/shared/context-map.ts", undefined, "The context shared has a context map, but shared hears no other context: its events are on the shared bus already, and the contexts hear them. Remove this file, and move each of its lines into the context map of the context that reacts."]
    ] },
  { rule: "context-has-di", branch: "a context without a port", files: { "src/backend/alerts/domain/event/AlertRaised.ts": "export class AlertRaised {}\n" }, expected: [
      ["src/backend/alerts", undefined, "src/backend/alerts is a context, but it has no di.ts, so the kernel does not find it. Write src/backend/alerts/di.ts with its bindings: `export default []`."]
    ] },
  {
    rule: "context-has-di", branch: "a context with a port and its adapter",
    files: {
      "src/backend/alerts/domain/port/alert-sender/AlertSender.ts": "export interface AlertSender { send(): void }\n",
      "src/backend/alerts/infra/alert-sender/email-alert-sender.ts": "export class EmailAlertSender implements AlertSender { send() {} }\n"
    },
    expected: [
      ["src/backend/alerts", undefined, "src/backend/alerts is a context, but it has no di.ts, so the kernel does not find it. Write src/backend/alerts/di.ts with its bindings: `export default [bind(AlertSender).to(EmailAlertSender)]`."]
    ]
  },
  { rule: "shared-components-are-tags", branch: "a component without index.marko, with one template", files: { "src/frontend/shared/presentation/component/chip/Chip.marko": "<span>Chip</span>\n" }, expected: [
      ["src/frontend/shared/presentation/component/chip", undefined, "The component chip of shared has no index.marko, but a component of the frontend context shared is a Marko tag, which its index.marko holds. Rename src/frontend/shared/presentation/component/chip/Chip.marko to index.marko."]
    ] },
  { rule: "shared-components-are-tags", branch: "a component without a template", files: { "src/frontend/shared/presentation/component/chip/chip.scss": ".chip { color: red; }\n" }, expected: [
      ["src/frontend/shared/presentation/component/chip", undefined, "The component chip of shared has no index.marko, but a component of the frontend context shared is a Marko tag, which its index.marko holds. Write src/frontend/shared/presentation/component/chip/index.marko."]
    ] },
  {
    rule: "shared-components-placed-by-tag", branch: "a view that imports a component of shared",
    files: { "src/frontend/notes/presentation/view/notes-count/NotesCount.marko": 'import Badge from "#frontend-shared/presentation/component/badge/index.marko";\n\n<Badge label=input.label/>\n' }, expected: [
      ["src/frontend/notes/presentation/view/notes-count/NotesCount.marko", 1, "This file imports src/frontend/shared/presentation/component/badge/index.marko, the component badge of shared, but Marko does not build an import of its file from another context. Remove the import, and place the component by its tag, `<badge>`."]
    ]
  },
  { rule: "imports-by-shortcut", branch: "a file of its context", files: { [handler]: 'import "../../domain/entity/Note.js";\n\nimport type { AddNoteOutput } from "./add-note.dto.js";\nexport class AddNoteHandler { execute(): AddNoteOutput { return new AddNoteOutput(); } }\n' }, expected: [
      ["src/backend/notes/command/add-note/add-note.handler.ts", 1, "This file imports ../../domain/entity/Note.js, which goes up a folder: the import breaks when the file moves. Import it as #context/domain/entity/Note.js."]
    ] },
  { rule: "imports-by-shortcut", branch: "a file of shared in the backend", files: { "src/backend/notes/domain/entity/Note.ts": 'import "../../../shared/domain/value-object/Text.js";\n\nexport class Note {}\n' }, expected: [
      ["src/backend/notes/domain/entity/Note.ts", 1, "This file imports ../../../shared/domain/value-object/Text.js, which goes up a folder: the import breaks when the file moves. Import it as #shared/domain/value-object/Text.js."]
    ] },
  { rule: "imports-by-shortcut", branch: "a file of shared in the frontend", files: { "src/frontend/notes/presentation/NotesFrontend.ts": 'import "../../shared/domain/value-object/Label.js";\n\nexport type NotesFrontend = { events: object };\n' }, expected: [
      ["src/frontend/notes/presentation/NotesFrontend.ts", 1, "This file imports ../../shared/domain/value-object/Label.js, which goes up a folder: the import breaks when the file moves. Import it as #frontend-shared/domain/value-object/Label.js."]
    ] },
  { rule: "imports-by-shortcut", branch: "a route", files: { "src/routes/_frontend/+page.marko": 'import NotesBlock from "../../frontend/notes/presentation/view/notes-block/NotesBlock.marko";\n\n<main><${NotesBlock}/></main>\n' }, expected: [
      ["src/routes/_frontend/+page.marko", 1, "This file imports ../../frontend/notes/presentation/view/notes-block/NotesBlock.marko, which goes up a folder: the import breaks when the file moves. Import it as #frontend/notes/presentation/view/notes-block/NotesBlock.marko."]
    ] },
  { rule: "imports-by-shortcut", branch: "a file that no shortcut leads to", files: { [handler]: 'import "../../../../../test/support/notes.js";\n\nimport type { AddNoteOutput } from "./add-note.dto.js";\nexport class AddNoteHandler { execute(): AddNoteOutput { return new AddNoteOutput(); } }\n' }, expected: [
      ["src/backend/notes/command/add-note/add-note.handler.ts", 1, "This file imports ../../../../../test/support/notes.js, which goes up a folder: the import breaks when the file moves. Use #context/ in a context, #shared/ or #frontend-shared/ for shared, and #backend/ or #frontend/ in a route."]
    ] },
  { rule: "imports-by-shortcut", branch: "a stylesheet", files: { "src/frontend/notes/presentation/view/notes-block/NotesBlock.scss": '\n@use "../../../../../routes/_frontend/style/theme";\n' }, expected: [
      ["src/frontend/notes/presentation/view/notes-block/NotesBlock.scss", 2, "This stylesheet loads ../../../../../routes/_frontend/style/theme, which goes up a folder, but a stylesheet loads only the files of its folder: Sass reads # as the start of a fragment. Read the values of the theme as CSS variables instead."]
    ] },
  { rule: "contexts-isolated", branch: "a handler of the backend", files: { [handler]: 'import "#backend/alerts/domain/event/AlertRaised.js";\n\nimport type { AddNoteOutput } from "./add-note.dto.js";\nexport class AddNoteHandler { execute(): AddNoteOutput { return new AddNoteOutput(); } }\n' }, expected: [
      ["src/backend/notes/command/add-note/add-note.handler.ts", 1, "The context notes imports src/backend/alerts/domain/event/AlertRaised.js, a file of the context alerts, but a context never imports another context. Publish an event of notes, share it as an event of shared in src/backend/notes/context-map.ts, and turn it into an input of alerts in src/backend/alerts/context-map.ts."]
    ] },
  { rule: "contexts-isolated", branch: "a handler of the frontend", files: { "src/frontend/notes/query/list-notes/list-notes.handler.ts": 'import "#frontend/alerts/event/AlertRaised.js";\n\nexport class ListNotesHandler {}\n' }, expected: [
      ["src/frontend/notes/query/list-notes/list-notes.handler.ts", 1, "The context notes imports src/frontend/alerts/event/AlertRaised.js, a file of the context alerts, but a context never imports another context. Publish an event of notes, share it as an event of shared in src/frontend/notes/context-map.ts, and turn it into an event of alerts in src/frontend/alerts/context-map.ts."]
    ] },
  { rule: "contexts-isolated", branch: "a view that imports a view of another context", files: { "src/frontend/notes/presentation/view/notes-count/NotesCount.marko": 'import "#frontend/alerts/presentation/view/alert-list/AlertList.marko";\n\n<p>Notes</p>\n' }, expected: [
      ["src/frontend/notes/presentation/view/notes-count/NotesCount.marko", 1, "The view notes-count of notes imports src/frontend/alerts/presentation/view/alert-list/AlertList.marko, a view of alerts, but a context never imports another context. Let the route place the two views side by side."]
    ] },
  { rule: "contexts-isolated", branch: "the context shared", files: { "src/backend/shared/domain/event/UserJoined.ts": 'import "#backend/notes/domain/entity/Note.js";\n\nexport class UserJoined {}\n' }, expected: [
      ["src/backend/shared/domain/event/UserJoined.ts", 1, "The context shared imports src/backend/notes/domain/entity/Note.js, a file of the context notes, but a context never imports another context. Publish an event of shared: the context map of notes turns it into an input of its own."]
    ] },
  { rule: "tests-in-one-context", branch: "a test of a context", files: { "src/backend/notes/command/add-note/add-note.application.test.ts": 'import { RaiseCommand } from "#backend/alerts/command/raise/raise.dto.js";\n\ntest(() => new RaiseCommand());\n' }, expected: [
      ["src/backend/notes/command/add-note/add-note.application.test.ts", 1, "This test of backend/notes reads backend/alerts, but a test reads only its context and shared: each context is tested alone. Split it: test in backend/notes what its context map shares, and in backend/alerts what its context map does with that event of shared."]
    ] },
  { rule: "tests-in-one-context", branch: "a test of a view that builds another frontend", files: { "src/frontend/notes/presentation/view/notes-block/NotesBlock.test.ts": '\ntest(() => testPresentation("alerts"));\n' }, expected: [
      ["src/frontend/notes/presentation/view/notes-block/NotesBlock.test.ts", 2, "This test of frontend/notes reads frontend/alerts, but a test reads only its context and shared: each context is tested alone. Split it: test in frontend/notes what its context map shares, and in frontend/alerts what its context map does with that event of shared."]
    ] },
  {
    rule: "tests-in-one-context", branch: "an integration test of two contexts",
    files: { "src/backend/backend.integration.test.ts": 'import { AddNoteCommand } from "./notes/command/add-note/add-note.dto.js";\nimport { RaiseCommand } from "./alerts/command/raise/raise.dto.js";\n\ntest(() => [AddNoteCommand, RaiseCommand]);\n' },
    expected: [
      ["src/backend/backend.integration.test.ts", 2, "This test reads backend/notes and backend/alerts, but a test outside the contexts reads one context at most, and the context shared of its side. Split it into one test per context."]
    ]
  },
  { rule: "sides-apart", branch: "the frontend imports the backend", files: { [store]: 'import { AddNoteCommand } from "#backend/notes/command/add-note/add-note.dto.js";\n\nexport default { send: () => new AddNoteCommand() };\n' }, expected: [
      ["src/frontend/notes/presentation/store/notesStore.ts", 1, "The frontend imports src/backend/notes/command/add-note/add-note.dto.js, a file of the backend, but the frontend and the backend are two projects, which talk only through the HTTP API. Declare what the frontend needs in src/frontend/notes, and call the API through an adapter of src/frontend/notes/infra/, behind a port."]
    ] },
  { rule: "sides-apart", branch: "the backend imports the frontend", files: { [handler]: 'import "#frontend/notes/event/NotesRequested.js";\n\nimport type { AddNoteOutput } from "./add-note.dto.js";\nexport class AddNoteHandler { execute(): AddNoteOutput { return new AddNoteOutput(); } }\n' }, expected: [
      ["src/backend/notes/command/add-note/add-note.handler.ts", 1, "The backend imports src/frontend/notes/event/NotesRequested.js, a file of the frontend, but the frontend and the backend are two projects, which talk only through the HTTP API. Declare what the backend needs in src/backend/notes."]
    ] },
  { rule: "domain-imports-no-application", branch: "an input DTO", files: { [entity]: 'import { AddNoteCommand } from "#context/command/add-note/add-note.dto.js";\n\nexport class Note { command?: AddNoteCommand; }\n' }, expected: [
      ["src/backend/notes/domain/entity/Note.ts", 1, "The domain layer must not import the application layer (src/backend/notes/command/add-note/add-note.dto.js): the use cases depend on the domain, not the other way. Let the handler read the DTO, and give Note the values it needs."]
    ] },
  { rule: "domain-imports-no-application", branch: "an event of the frontend", files: { "src/frontend/notes/domain/entity/Note.ts": 'import { LabelChosen } from "#frontend-shared/event/LabelChosen.js";\n\nexport class Note {}\n' }, expected: [
      ["src/frontend/notes/domain/entity/Note.ts", 1, "The domain layer must not import the application layer (src/frontend/shared/event/LabelChosen.js): the use cases depend on the domain, not the other way. Move what the domain needs into src/frontend/notes/domain/."]
    ] },
  { rule: "domain-imports-no-presentation", branch: "a controller", files: { [entity]: 'import "#context/command/add-note/add-note.http.controller.js";\n\nexport class Note {}\n' }, expected: [
      ["src/backend/notes/domain/entity/Note.ts", 1, "The domain layer must not import the presentation layer (src/backend/notes/command/add-note/add-note.http.controller.js): the presentation reads the domain, not the other way. Move what the domain needs into src/backend/notes/domain/."]
    ] },
  { rule: "domain-imports-no-infra", branch: "an adapter", files: { [entity]: 'import "#context/infra/note-repository/in-memory-note-repository.js";\n\nexport class Note {}\n' }, expected: [
      ["src/backend/notes/domain/entity/Note.ts", 1, "The domain layer must not import the infra layer (src/backend/notes/infra/note-repository/in-memory-note-repository.js): the domain declares what it needs, and the infra implements it. Declare it as a port in src/backend/notes/domain/port/, and let a handler call the port and give the result to Note."]
    ] },
  { rule: "application-imports-no-presentation", branch: "a handler of the backend", files: { [handler]: 'import "./add-note.http.controller.js";\n\nimport type { AddNoteOutput } from "./add-note.dto.js";\nexport class AddNoteHandler { execute(): AddNoteOutput { return new AddNoteOutput(); } }\n' }, expected: [
      ["src/backend/notes/command/add-note/add-note.handler.ts", 1, "The application layer must not import the presentation layer (src/backend/notes/command/add-note/add-note.http.controller.js): the controller sends the use case its DTO, not the other way. Move what the handler needs into add-note.dto.ts, or into src/backend/notes/domain/."]
    ] },
  { rule: "application-imports-no-presentation", branch: "a handler of the frontend", files: { "src/frontend/notes/query/list-notes/list-notes.handler.ts": 'import "#context/presentation/store/notesStore.js";\n\nexport class ListNotesHandler {}\n' }, expected: [
      ["src/frontend/notes/query/list-notes/list-notes.handler.ts", 1, "The application layer must not import the presentation layer (src/frontend/notes/presentation/store/notesStore.js): the store and the views hear the use cases through events. Publish an event of notes instead, and let the store or the view hear it."]
    ] },
  { rule: "application-imports-no-presentation", branch: "a file of the application out of a use case", files: { "src/backend/notes/command/helpers.ts": 'import "#context/command/add-note/add-note.http.controller.js";\n\nexport const trim = (text: string) => text.trim();\n' }, expected: [
      ["src/backend/notes/command/helpers.ts", 1, "The application layer must not import the presentation layer (src/backend/notes/command/add-note/add-note.http.controller.js): the controller sends the use case its DTO, not the other way. Move what it needs into src/backend/notes/domain/."]
    ] },
  { rule: "application-imports-no-infra", branch: "an adapter in the folder of its port", files: { [handler]: 'import "#context/infra/note-repository/in-memory-note-repository.js";\n\nimport type { AddNoteOutput } from "./add-note.dto.js";\nexport class AddNoteHandler { execute(): AddNoteOutput { return new AddNoteOutput(); } }\n' }, expected: [
      ["src/backend/notes/command/add-note/add-note.handler.ts", 1, "The application layer must not import the infra layer (src/backend/notes/infra/note-repository/in-memory-note-repository.js). Depend on its port, NoteRepository (src/backend/notes/domain/port/note-repository/NoteRepository.ts), instead, and bind the adapter in src/backend/notes/di.ts."]
    ] },
  { rule: "application-imports-no-infra", branch: "a file of the infra out of the folders of the ports", files: { [handler]: 'import "#context/infra/helpers.js";\n\nimport type { AddNoteOutput } from "./add-note.dto.js";\nexport class AddNoteHandler { execute(): AddNoteOutput { return new AddNoteOutput(); } }\n' }, expected: [
      ["src/backend/notes/command/add-note/add-note.handler.ts", 1, "The application layer must not import the infra layer (src/backend/notes/infra/helpers.js). Depend on its port in domain/port/ instead, and bind the adapter in src/backend/notes/di.ts."]
    ] },
  { rule: "presentation-imports-no-infra", branch: "a controller", files: { [controller]: `import "#context/infra/note-repository/in-memory-note-repository.js";\n${project[controller]}` }, expected: [
      ["src/backend/notes/command/add-note/add-note.http.controller.ts", 1, "The presentation layer must not import the infra layer (src/backend/notes/infra/note-repository/in-memory-note-repository.js): a controller sends a DTO to its use case, and the handler uses the port. Send the DTO of add-note, and let src/backend/notes/command/add-note/add-note.handler.ts depend on NoteRepository (src/backend/notes/domain/port/note-repository/NoteRepository.ts); src/backend/notes/di.ts binds the adapter."]
    ] },
  { rule: "presentation-imports-no-infra", branch: "a file of the presentation out of a use case", files: { "src/backend/notes/presentation/helpers.ts": 'import "#context/infra/note-repository/in-memory-note-repository.js";\n\nexport const trim = (text: string) => text.trim();\n' }, expected: [
      ["src/backend/notes/presentation/helpers.ts", 1, "The presentation layer must not import the infra layer (src/backend/notes/infra/note-repository/in-memory-note-repository.js): a controller sends a DTO to its use case, and the handler uses the port. Send the DTO of its use case, and let the handler depend on NoteRepository (src/backend/notes/domain/port/note-repository/NoteRepository.ts); src/backend/notes/di.ts binds the adapter."]
    ] },
  {
    rule: "presentation-imports-no-infra", branch: "a view",
    files: { "src/frontend/notes/presentation/view/notes-feed/notesFeed.ts": `import "#context/infra/notes-gateway/http-notes-gateway.js";\n${project["src/frontend/notes/presentation/view/notes-feed/notesFeed.ts"]}` }, expected: [
      ["src/frontend/notes/presentation/view/notes-feed/notesFeed.ts", 1, "The presentation layer must not import the infra layer (src/frontend/notes/infra/notes-gateway/http-notes-gateway.js): a view publishes events, and the handlers of the use cases call the ports. Publish an event of notes, let the store send the DTO of a use case, and let its handler depend on NotesGateway (src/frontend/notes/domain/port/notes-gateway/NotesGateway.ts)."]
    ]
  },
  { rule: "infra-imports-no-presentation", branch: "an adapter of the frontend", files: { [frontendAdapter]: `import "#context/presentation/view/notes-block/NotesBlock.marko";\n${project[frontendAdapter]}` }, expected: [
      ["src/frontend/notes/infra/notes-gateway/http-notes-gateway.ts", 1, "The infra layer must not import the presentation layer (src/frontend/notes/presentation/view/notes-block/NotesBlock.marko): an adapter implements a port of the domain, and knows neither the views nor the controllers. Move what the adapter needs into src/frontend/notes/domain/, or the application of the frontend."]
    ] },
  { rule: "infra-imports-no-presentation", branch: "an adapter of the backend", files: { [backendAdapter]: `import "#context/command/add-note/add-note.http.controller.js";\n${project[backendAdapter]}` }, expected: [
      ["src/backend/notes/infra/note-repository/in-memory-note-repository.ts", 1, "The infra layer must not import the presentation layer (src/backend/notes/command/add-note/add-note.http.controller.js): an adapter implements a port of the domain, and knows neither the views nor the controllers. Move what the adapter needs into src/backend/notes/domain/."]
    ] },
  { rule: "infra-imports-no-application", branch: "an adapter of the backend", files: { [backendAdapter]: `import "#context/command/add-note/add-note.dto.js";\n${project[backendAdapter]}` }, expected: [
      ["src/backend/notes/infra/note-repository/in-memory-note-repository.ts", 1, "In the backend, the infra layer must not import the application layer (src/backend/notes/command/add-note/add-note.dto.js): an adapter implements a port, and the use cases call it. Move what the adapter needs into src/backend/notes/domain/, such as a value object that the port takes."]
    ] },
  { rule: "infra-imports-no-application", branch: "an adapter of the frontend, which may", files: { [frontendAdapter]: `import "#context/event/NotesRequested.js";\n${project[frontendAdapter]}` }, expected: [] },
  { rule: "di-imports-no-application", branch: "a handler", files: { "src/backend/notes/di.ts": `import "./command/add-note/add-note.handler.js";\n${project["src/backend/notes/di.ts"]}` }, expected: [
      ["src/backend/notes/di.ts", 1, "di.ts must not import the application layer (src/backend/notes/command/add-note/add-note.handler.js): it binds the ports of the domain to the adapters of the infra. Remove the import: the kernel finds the handlers and the DTOs in command/ and query/ by itself."]
    ] },
  { rule: "di-imports-no-presentation", branch: "a controller", files: { "src/backend/notes/di.ts": `import "./command/add-note/add-note.http.controller.js";\n${project["src/backend/notes/di.ts"]}` }, expected: [
      ["src/backend/notes/di.ts", 1, "di.ts must not import the presentation layer (src/backend/notes/command/add-note/add-note.http.controller.js): it binds the ports of the domain to the adapters of the infra. Remove the import: the kernel finds the controllers in command/ and query/ by itself, and the routes place the views."]
    ] },
  { rule: "context-map-read-by-kernel", branch: "a view", files: { "src/frontend/notes/presentation/view/notes-count/NotesCount.marko": 'import "#context/context-map.js";\n\n<p>Notes</p>\n' }, expected: [
      ["src/frontend/notes/presentation/view/notes-count/NotesCount.marko", 1, "The presentation imports src/frontend/notes/context-map.js, the context map of notes, but only the kernel reads a context map. Remove the import, publish an event of notes, and let the context map share it."]
    ] },
  { rule: "context-map-read-by-kernel", branch: "a handler", files: { [handler]: 'import "#context/context-map.js";\n\nimport type { AddNoteOutput } from "./add-note.dto.js";\nexport class AddNoteHandler { execute(): AddNoteOutput { return new AddNoteOutput(); } }\n' }, expected: [
      ["src/backend/notes/command/add-note/add-note.handler.ts", 1, "The application imports src/backend/notes/context-map.js, the context map of notes, but only the kernel reads a context map. Remove the import, publish an event of notes, and let the context map share it."]
    ] },
  { rule: "context-map-read-by-kernel", branch: "a di.ts", files: { "src/backend/notes/di.ts": `import "./context-map.js";\n${project["src/backend/notes/di.ts"]}` }, expected: [
      ["src/backend/notes/di.ts", 1, "This di.ts imports src/backend/notes/context-map.js, the context map of notes, but only the kernel reads a context map. Remove the import, publish an event of notes, and let the context map share it."]
    ] },
  { rule: "contexts-without-routes", branch: "a handler", files: { [handler]: 'import "/src/routes/_backend/api/notes/+handler.js";\n\nimport type { AddNoteOutput } from "./add-note.dto.js";\nexport class AddNoteHandler { execute(): AddNoteOutput { return new AddNoteOutput(); } }\n' }, expected: [
      ["src/backend/notes/command/add-note/add-note.handler.ts", 1, "The context notes imports src/routes/_backend/api/notes/+handler.js, a route, but the routes use the contexts, never the other way. Move what it needs into src/backend/notes."]
    ] },
  { rule: "contexts-without-routes", branch: "a stylesheet", files: { "src/frontend/notes/presentation/view/notes-block/NotesBlock.scss": '@use "values";\n' }, expected: [
      ["src/frontend/notes/presentation/view/notes-block/NotesBlock.scss", 1, "This stylesheet loads src/routes/_frontend/style/_values.scss, a stylesheet of the routes, but the routes use the contexts, never the other way. Read the values of the theme as CSS variables instead."]
    ] },

  { rule: "routes-folders", branch: "an HTTP handler", files: { "src/routes/api/+handler.ts": "export const GET = () => null;\n" }, expected: [
      ["src/routes/api/+handler.ts", undefined, "src/routes/api/+handler.ts is outside _frontend and _backend, so it is on no side. Move it to src/routes/_backend/api/+handler.ts."]
    ] },
  { rule: "routes-folders", branch: "a page", files: { "src/routes/home/+page.marko": "<p>Home</p>\n" }, expected: [
      ["src/routes/home/+page.marko", undefined, "src/routes/home/+page.marko is outside _frontend and _backend, so it is on no side. Move it to src/routes/_frontend/home/+page.marko."]
    ] },
  { rule: "routes-folders", branch: "another file", files: { "src/routes/helpers.ts": "export const trim = (text: string) => text.trim();\n" }, expected: [
      ["src/routes/helpers.ts", undefined, "src/routes/helpers.ts is outside _frontend and _backend, so it is on no side. Move a page or a layout to src/routes/_frontend/, and an HTTP handler to src/routes/_backend/."]
    ] },
  { rule: "frontend-routes-content", branch: "code", files: { "src/routes/_frontend/helpers.ts": "export const trim = (text: string) => text.trim();\n" }, expected: [
      ["src/routes/_frontend/helpers.ts", undefined, "helpers.ts is code in the routes, but the routes hold no logic and no test. Move it into a frontend context: the code into its layers, with its test, and let the page place the view that uses it."]
    ] },
  { rule: "frontend-routes-content", branch: "a test", files: { "src/routes/_frontend/messages.test.ts": "test();\n" }, expected: [
      ["src/routes/_frontend/messages.test.ts", undefined, "messages.test.ts is a test in the routes, but the routes hold no logic and no test. Move it into a frontend context: the code into its layers, with its test, and let the page place the view that uses it."]
    ] },
  { rule: "frontend-routes-content", branch: "a stylesheet next to no page", files: { "src/routes/_frontend/messages/messages-page.scss": ".messages-page { color: red; }\n" }, expected: [
      ["src/routes/_frontend/messages/messages-page.scss", undefined, "messages-page.scss is next to no page or layout, but a stylesheet of the routes is in style/, in component/, or next to its page. Move it to src/routes/_frontend/style/, or next to the page that uses it."]
    ] },
  { rule: "frontend-routes-content", branch: "a template out of component/", files: { "src/routes/_frontend/notes/Board.marko": "<p>Board</p>\n" }, expected: [
      ["src/routes/_frontend/notes/Board.marko", undefined, "notes/Board.marko is a template outside component/, but the routes hold their pages, their layouts, and in component/ the components that only their pages use. Move it to src/routes/_frontend/component/, or into a view of a frontend context."]
    ] },
  { rule: "frontend-routes-content", branch: "a document in no folder", files: { "src/routes/_frontend/`sitemap.xml`+handler.ts": "export const GET = () => null;\n" }, expected: [
      ["src/routes/_frontend/`sitemap.xml`+handler.ts", undefined, "`sitemap.xml`+handler.ts is not the route of a document: such a route is a folder named after its file, with its +handler.ts. Move it to src/routes/_frontend/`sitemap.xml`/+handler.ts."]
    ] },
  { rule: "frontend-routes-content", branch: "a document without an extension", files: { "src/routes/_frontend/`notes`/+handler.ts": "export const GET = () => null;\n" }, expected: [
      ["src/routes/_frontend/`notes`/+handler.ts", undefined, "`notes`/+handler.ts is not the route of a document: such a route is a folder named after its file, with its extension, and holds its +handler.ts. Name the folder after the file that it gives, as `sitemap.xml`/+handler.ts."]
    ] },
  { rule: "frontend-routes-content", branch: "a test of a document", files: { "src/routes/_frontend/`notes.xml`/notes.test.ts": "test();\n" }, expected: [
      ["src/routes/_frontend/`notes.xml`/notes.test.ts", undefined, "`notes.xml`/notes.test.ts is a test in the routes, but the routes hold no logic and no test. Move it into a frontend context: the code into its layers, with its test, and let the page place the view that uses it."]
    ] },
  { rule: "backend-routes-content", branch: "a helper", files: { "src/routes/_backend/api/notes/helpers.ts": "export const trim = (text: string) => text.trim();\n" }, expected: [
      ["src/routes/_backend/api/notes/helpers.ts", undefined, "helpers.ts is not a +handler.ts, but the backend routes only give the request to a controller. Move its code into a backend context, in a controller or a handler, and let the route import the controller."]
    ] },
  { rule: "routes-on-their-side", branch: "a route of the frontend", files: { "src/routes/_frontend/component/Notes.marko": 'import "#backend/notes/command/add-note/add-note.http.controller.js";\n\n<p>Notes</p>\n' }, expected: [
      ["src/routes/_frontend/component/Notes.marko", 1, "This route of the frontend imports src/backend/notes/command/add-note/add-note.http.controller.js, a file of the backend, but the frontend and the backend are two projects, which talk only through the HTTP API. Place a view of a frontend context instead, which gets its data from the API through its adapter."]
    ] },
  { rule: "routes-on-their-side", branch: "a route of the backend", files: { [backendRoute]: `import "#frontend/notes/presentation/view/notes-block/NotesBlock.marko";\n${project[backendRoute]}` }, expected: [
      ["src/routes/_backend/api/notes/+handler.ts", 1, "This route of the backend imports src/frontend/notes/presentation/view/notes-block/NotesBlock.marko, a file of the frontend, but the frontend and the backend are two projects, which talk only through the HTTP API. Give the request to a controller of a backend context instead."]
    ] },
  { rule: "routes-through-presentation", branch: "a file of a use case of the backend", files: { [backendRoute]: 'import "#backend/notes/command/add-note/add-note.dto.js";\n' }, expected: [
      ["src/routes/_backend/api/notes/+handler.ts", 1, "This route imports src/backend/notes/command/add-note/add-note.dto.js, of the application of notes, but a route reaches a context only through its presentation. Import the controller of the use case, AddNoteHttpController (src/backend/notes/command/add-note/add-note.http.controller.ts), and give it the request: `controller(AddNoteHttpController).handle(ctx.request)`."]
    ] },
  { rule: "routes-through-presentation", branch: "the domain of the backend", files: { [backendRoute]: 'import "#backend/notes/domain/entity/Note.js";\n' }, expected: [
      ["src/routes/_backend/api/notes/+handler.ts", 1, "This route imports src/backend/notes/domain/entity/Note.js, of the domain of notes, but a route reaches a context only through its presentation. Import the controller of the use case, and give it the request: `controller(SomethingController).handle(ctx.request)`."]
    ] },
  { rule: "routes-through-presentation", branch: "a route of the frontend", files: { "src/routes/_frontend/+page.marko": 'import "#frontend/notes/query/list-notes/list-notes.dto.js";\n\n<main/>\n' }, expected: [
      ["src/routes/_frontend/+page.marko", 1, "This route imports src/frontend/notes/query/list-notes/list-notes.dto.js, of the application of notes, but a route reaches a context only through its presentation. Place a view of src/frontend/notes/presentation/view/ instead."]
    ] },
  { rule: "routes-take-no-frontend", branch: "a page", files: { "src/routes/_frontend/+page.marko": '<button onClick() { frontendOf($global, "notes"); }>Charger</button>\n' }, expected: [
      ["src/routes/_frontend/+page.marko", 1, "This route takes the frontend of notes, but a route only places views. Move the code into a view of src/frontend/notes/presentation/view/, which takes its frontend with frontendOf, and place the view in the page."]
    ] },

  { rule: "production-imports-no-test-environment", branch: "a handler", files: { [handler]: 'import "#context/test.di.js";\n\nimport type { AddNoteOutput } from "./add-note.dto.js";\nexport class AddNoteHandler { execute(): AddNoteOutput { return new AddNoteOutput(); } }\n' }, expected: [
      ["src/backend/notes/command/add-note/add-note.handler.ts", 1, "This file imports src/backend/notes/test.di.js, the test environment of notes, but test.di.ts replaces dependencies in the tests only. Remove the import, and bind what the production code needs in src/backend/notes/di.ts."]
    ] },
  { rule: "production-imports-no-test-support", branch: "an adapter", files: { [backendAdapter]: `import "@ingenioz-it/caits/testing/backend/infra";\n${project[backendAdapter]}` }, expected: [
      ["src/backend/notes/infra/note-repository/in-memory-note-repository.ts", 1, "This file imports @ingenioz-it/caits/testing/backend/infra, the test support of the kernel, but the production code never uses the tools of the tests. Move the code that needs it into a test."]
    ] },
  { rule: "production-imports-only-src", branch: "a file of test/", files: { [handler]: 'import "../../../../../test/support/notes.js";\n\nimport type { AddNoteOutput } from "./add-note.dto.js";\nexport class AddNoteHandler { execute(): AddNoteOutput { return new AddNoteOutput(); } }\n' }, expected: [
      ["src/backend/notes/command/add-note/add-note.handler.ts", 1, "This file imports test/support/notes.js, outside src, but the production code imports nothing outside src: test/ and quality/ are not part of the app. Move what it needs into src/backend/notes."]
    ] },
  { rule: "production-imports-only-src", branch: "a file of another folder", files: { [handler]: 'import "../../../../../scripts/notes.js";\n\nimport type { AddNoteOutput } from "./add-note.dto.js";\nexport class AddNoteHandler { execute(): AddNoteOutput { return new AddNoteOutput(); } }\n' }, expected: [
      ["src/backend/notes/command/add-note/add-note.handler.ts", 1, "This file imports scripts/notes.js, outside src, but the production code imports nothing outside src: that folder is not part of the app. Move what it needs into src/backend/notes."]
    ] },
  {
    rule: "production-imports-only-src", branch: "the kernel by its path",
    files: { [handler]: 'import "../../../../../node_modules/@ingenioz-it/caits/src/di/Container.js";\n\nimport type { AddNoteOutput } from "./add-note.dto.js";\nexport class AddNoteHandler { execute(): AddNoteOutput { return new AddNoteOutput(); } }\n' }, expected: [
      ["src/backend/notes/command/add-note/add-note.handler.ts", 1, "This file imports node_modules/@ingenioz-it/caits/src/di/Container.js, a file of the kernel, by its path. Import it by its name, @ingenioz-it/caits/di/Container."]
    ]
  },
  {
    rule: "production-imports-only-src", branch: "a route",
    files: { [backendRoute]: `import "../../../../../test/support/notes.js";\n${project[backendRoute]}` }, expected: [
      ["src/routes/_backend/api/notes/+handler.ts", 1, "This file imports test/support/notes.js, outside src, but the production code imports nothing outside src: test/ and quality/ are not part of the app. Move what it needs into src."]
    ]
  },

  { rule: "exceptions-in-quality", branch: "a comment of ESLint", files: { [handler]: "\n// eslint-disable-next-line @typescript-eslint/no-explicit-any\nimport type { AddNoteOutput } from \"./add-note.dto.js\";\nexport class AddNoteHandler { execute(): AddNoteOutput { return new AddNoteOutput(); } }\n" }, expected: [
      ["src/backend/notes/command/add-note/add-note.handler.ts", 2, "This comment turns off a check, `eslint-disable-next-line @typescript-eslint/no-explicit-any`, so the exception hides in the code. Fix the code, or turn the rule off for this file only in quality/eslint.config.js."]
    ] },
  { rule: "exceptions-in-quality", branch: "a comment of TypeScript", files: { [handler]: "// @ts-ignore\nimport type { AddNoteOutput } from \"./add-note.dto.js\";\nexport class AddNoteHandler { execute(): AddNoteOutput { return new AddNoteOutput(); } }\n" }, expected: [
      ["src/backend/notes/command/add-note/add-note.handler.ts", 1, "This comment turns off a check, `@ts-ignore`, so the exception hides in the code. Fix the type."]
    ] },
  { rule: "exceptions-in-quality", branch: "a comment of the coverage", files: { [handler]: "/* v8 ignore next */\nimport type { AddNoteOutput } from \"./add-note.dto.js\";\nexport class AddNoteHandler { execute(): AddNoteOutput { return new AddNoteOutput(); } }\n" }, expected: [
      ["src/backend/notes/command/add-note/add-note.handler.ts", 1, "This comment turns off a check, `v8 ignore next`, so the exception hides in the code. Test these lines, or leave this file out of the coverage in quality/vite.config.ts."]
    ] },
  { rule: "exceptions-in-quality", branch: "a comment of Stryker", files: { [handler]: "// Stryker disable next-line all\nimport type { AddNoteOutput } from \"./add-note.dto.js\";\nexport class AddNoteHandler { execute(): AddNoteOutput { return new AddNoteOutput(); } }\n" }, expected: [
      ["src/backend/notes/command/add-note/add-note.handler.ts", 1, "This comment turns off a check, `Stryker disable next-line all`, so the exception hides in the code. Kill the mutant with a test, or leave this file out of the mutants in quality/stryker.config.mjs."]
    ] },
  { rule: "exceptions-in-quality", branch: "a test that does not run", files: { "src/backend/notes/command/add-note/add-note.application.test.ts": "test(() => {});\ntest.skip(() => {});\n" }, expected: [
      ["src/backend/notes/command/add-note/add-note.application.test.ts", 2, "`test.skip` keeps the test from running, but every test runs, every time, and passes. Remove .skip, and fix the test or the code."]
    ] },
  { rule: "exceptions-in-quality", branch: "a test that runs alone", files: { "src/backend/notes/command/add-note/add-note.application.test.ts": "test.only(() => {});\n" }, expected: [
      ["src/backend/notes/command/add-note/add-note.application.test.ts", 1, "`test.only` keeps the other tests from running, but every test runs, every time, and passes. Remove .only."]
    ] },
  { rule: "exceptions-in-quality", branch: "a test that may fail", files: { "src/backend/notes/command/add-note/add-note.application.test.ts": "test.fails(() => {});\n" }, expected: [
      ["src/backend/notes/command/add-note/add-note.application.test.ts", 1, "`test.fails` lets the test pass when it fails, but every test runs, every time, and passes. Remove .fails, and fix the test or the code."]
    ] }
];

describe("the messages of the rules", () => {
  test.for(messages)("$rule: $branch", ({ rule, files, packages, expected }) => {
    expect(checkWith(files, packages).filter(violation => violation.rule === rule).map(({ file, line, message }) => [file, line, message])).toEqual(expected);
  });

  test("each rule has its messages", () => {
    expect(new Set(messages.map(({ rule }) => rule))).toEqual(new Set(rules.map(({ name }) => name)));
  });
});

describe("the engine", () => {
  const sources = [{ path: "src/backend/notes/domain/entity/Note.ts", text: 'import "uuid";\n\nimport "#context/domain/error/InvalidNoteError.js";\nexport class Note {}\n' }];
  const name = "under-test";
  const description = "The rule of a test.";

  test("a check gives a message, a message at a line, or a list of both", () => {
    /** @type {Rule} */
    const rule = { name, description, on: "file", check: () => ["It is wrong.", { line: 4, message: "It is wrong here." }] };

    expect(checkArchitecture(ROOT, sources, [rule]).violations).toEqual([
      { rule: name, file: "src/backend/notes/domain/entity/Note.ts", message: "It is wrong." },
      { rule: name, file: "src/backend/notes/domain/entity/Note.ts", message: "It is wrong here.", line: 4 }
    ]);
  });

  test("the message of a rule on the imports is at the line of the import, unless it gives its own", () => {
    /** @type {Rule} */
    const located = { name, description, on: "import", check: ({ specifier }) => specifier === "uuid" ? "It is wrong." : { line: 1, message: "It is wrong there." } };
    /** @type {Rule} */
    const lineless = { name, description, on: "import", check: () => ({ message: "It is wrong." }) };

    expect(checkArchitecture(ROOT, sources, [located]).violations.map(({ message, line }) => [message, line])).toEqual([["It is wrong.", 1], ["It is wrong there.", 1]]);
    expect(checkArchitecture(ROOT, sources, [lineless]).violations.map(({ line }) => line)).toEqual([1, 3]);
  });

  test("a rule on the imports reads the project, as a rule on the files does", () => {
    /** @type {Rule} */
    const rule = { name, description, on: "import", check: ({ internal }, { paths, packages }) => internal && `${[...paths].join()} ${JSON.stringify(packages)}` };

    expect(checkArchitecture(ROOT, sources, [rule], { domain: ["uuid"] }).violations.map(({ message }) => message))
      .toEqual(['src/backend/notes/domain/entity/Note.ts {"domain":["uuid"]}']);
  });

  test("a rule on the project gives the line of a message, if it has one", () => {
    /** @type {Rule} */
    const rule = { name, description, on: "project", check: () => [{ file: "src/a.ts", line: 2, message: "It is wrong." }, { file: "src/b.ts", message: "It is wrong too." }] };

    expect(checkArchitecture(ROOT, sources, [rule]).violations).toEqual([
      { rule: name, file: "src/a.ts", message: "It is wrong.", line: 2 },
      { rule: name, file: "src/b.ts", message: "It is wrong too." }
    ]);
  });

  test.for(/** @type {[string, unknown, string][]} */ ([
    ["a key that is no layer", { domian: [] }, " (domian)"],
    ["a list that is a name", { domain: "uuid" }, " (domain)"],
    ["a list that holds no name", { domain: [1] }, " (domain)"],
    ["no object", null, ""],
    ["a list", [], ""]
  ]))("refuses packages that are not lists of names, by the key of a layer: %s", ([, packages, which]) => {
    expect(() => checkArchitecture(ROOT, sources, [], /** @type {Packages} */ (packages)))
      .toThrow(`quality/imports.mjs must export the packages that each layer may import, as lists of names: { domain: […], application: […], presentation: […], infra: […], di: […], contextMap: […] }${which}`);
  });
});

describe("the exceptions", () => {
  const applicationTest = "src/backend/notes/command/add-note/add-note.application.test.ts";
  const view = "src/frontend/notes/presentation/view/notes-block/NotesBlock.marko";
  const withComment = (/** @type {string} */ comment) => `${comment}\nimport type { AddNoteOutput } from "./add-note.dto.js";\nexport class AddNoteHandler { execute(): AddNoteOutput { return new AddNoteOutput(); } }\n`;

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
    expect(violationsWith({ [handler]: 'import "./add-note.http.controller.js";\n\nimport type { AddNoteOutput } from "./add-note.dto.js";\nexport class AddNoteHandler { execute(): AddNoteOutput { return new AddNoteOutput(); } }\n' }))
      .toEqual([["application-imports-no-presentation", handler]]);
  });

  test("a use case imports nothing from a use case of the context shared either", () => {
    expect(violationsWith({ [handler]: 'import "#shared/command/announce/announce.dto.js";\n\nimport type { AddNoteOutput } from "./add-note.dto.js";\nexport class AddNoteHandler { execute(): AddNoteOutput { return new AddNoteOutput(); } }\n' }))
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
      "component/notes.ts is code in the routes, but the routes hold no logic and no test. Move it into a frontend context: the code into its layers, with its test, and let the page place the view that uses it."
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

  test("the domain imports no event: only domain-imports-no-application says it", () => {
    const entity = "src/frontend/notes/domain/entity/Note.ts";
    expect(violationsWith({ [entity]: `${labelChosen}\nexport class Note {}\n` })).toEqual([["domain-imports-no-application", entity]]);
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
      [handler]: `${notePosted}import { AddNoteOutput } from "./add-note.dto.js";\n\nexport class AddNoteHandler { execute(): AddNoteOutput { return new AddNoteOutput(); } }\n`,
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
    expect(violationsWith({ [view]: 'import "#context/context-map.js";\n\n<p>Notes</p>\n' })).toEqual([["context-map-read-by-kernel", view]]);
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
    expect(violationsWith({ [handler]: 'import "#context/context-map.js";\n\nimport type { AddNoteOutput } from "./add-note.dto.js";\nexport class AddNoteHandler { execute(): AddNoteOutput { return new AddNoteOutput(); } }\n' })).toEqual([["context-map-read-by-kernel", handler]]);
  });
});

describe("the lines of the context maps", () => {
  const frontendMap = "src/frontend/notes/context-map.ts";
  const backendMapOf = (/** @type {string} */ lines) => ({ [contextMap]: `${BACKEND_MAP_IMPORTS}\nexport default [${lines}];\n` });

  test("a context map lists only its lines, made with the when and the share of the kernel for its side", () => {
    expect(messagesWith(backendMapOf("when(UserJoined, () => [new AddNoteCommand()]), share(NoteAdded, () => [new NotePosted()]), ...[]"))).toEqual([
      ["context-map-holds-lines", "The item `...[]` is not a line: each line of a context map is made with when(…) or share(…). Write it `when(SharedEvent, event => […])` to hear an event of shared, or `share(OwnEvent, event => […])` to share an event of notes."]
    ]);
    const frontendLines = BACKEND_MAP_IMPORTS.replace("@ingenioz-it/caits/messaging/ContextMap", "@ingenioz-it/caits/messaging/FrontendContextMap");
    expect(messagesWith({ [contextMap]: `${frontendLines}\nexport default [when(UserJoined, () => [new AddNoteCommand()]), share(NoteAdded, () => [new NotePosted()])];\n` })).toEqual([
      ["context-map-holds-lines", "The context map takes share from @ingenioz-it/caits/messaging/FrontendContextMap, but a context map of the backend takes it from @ingenioz-it/caits/messaging/ContextMap. Import share from @ingenioz-it/caits/messaging/ContextMap."],
      ["context-map-holds-lines", "The context map takes when from @ingenioz-it/caits/messaging/FrontendContextMap, but a context map of the backend takes it from @ingenioz-it/caits/messaging/ContextMap. Import when from @ingenioz-it/caits/messaging/ContextMap."]
    ]);
  });

  test("a context map has one export", () => {
    expect(messagesWith({ [frontendMap]: `${FRONTEND_MAP_IMPORTS}\nexport const LINES = 2;\nexport default [when(LabelChosen, () => [new NotesRequested()]), share(NoteLabelChosen, () => [new LabelChosen()])];\n` })).toEqual([
      ["context-map-holds-lines", "The context map exports 2 names (LINES, default), but a context map has one export, the list of its lines. Write `export default [when(Event, event => […]), share(Event, event => […])]`, and nothing else."]
    ]);
  });

  test("in the backend, share starts from an event of the context and gives events of shared; when starts from an event of shared and gives inputs", () => {
    expect(messagesWith(backendMapOf("when(NoteAdded, () => [new AddNoteCommand()]), share(NotePosted, () => [new UserJoined()]), share(NoteAdded, () => [new AddNoteCommand()]), when(UserJoined, () => [new NotePosted()])"))).toEqual([
      ["context-map-line-direction", "The line `when(NoteAdded, …)` starts from NoteAdded, an event of notes, but when(…) hears an event of shared, from the shared bus: this line never runs. Write it `share(NoteAdded, …)` to share it, or hear an event of src/backend/shared/domain/event/."],
      ["context-map-line-direction", "The line `share(NotePosted, …)` starts from NotePosted, an event of shared, but share(…) starts from an event of notes: this line never runs. Write it `when(NotePosted, …)` to react to NotePosted, or start it from an event of src/backend/notes/domain/event/."],
      ["context-map-line-direction", "The line `share(NoteAdded, …)` gives AddNoteCommand, which is not an event of shared, but share(…) gives events of shared. Give an event of src/backend/shared/domain/event/ instead."],
      ["context-map-line-direction", "The line `when(UserJoined, …)` gives NotePosted, which is not an input DTO of notes, but when(…) gives what its context reacts to. Give an input DTO of src/backend/notes/command/ or src/backend/notes/query/ instead."]
    ]);
  });

  test("in the frontend, when gives the events of the context; a line may build the values of the domain that its events hold", () => {
    const imports = `${FRONTEND_MAP_IMPORTS}import { Label } from "#frontend-shared/domain/value-object/Label.js";\n`;
    expect(messagesWith({ [frontendMap]: `${imports}\nexport default [when(LabelChosen, () => [new LabelChosen(), new NotesRequested(new Label("a"))]), share(NoteLabelChosen, () => [new LabelChosen()])];\n` })).toEqual([
      ["context-map-line-direction", "The line `when(LabelChosen, …)` gives LabelChosen, which is not an event of notes, but when(…) gives what its context reacts to. Give an event of src/frontend/notes/event/ instead."]
    ]);
  });

  test("a line whose event is neither of the context nor of shared starts from no event of its kind", () => {
    const imports = `${FRONTEND_MAP_IMPORTS}import { Label } from "#frontend-shared/domain/value-object/Label.js";\n`;
    expect(messagesWith({ [frontendMap]: `${imports}\nexport default [when(Label, () => []), share(Label, () => [])];\n` })).toEqual([
      ["context-map-line-direction", "The line `when(Label, …)` starts from Label, which is not an event of shared: this line never runs. Hear an event of src/frontend/shared/event/."],
      ["context-map-line-direction", "The line `share(Label, …)` starts from Label, which is not an event of notes: this line never runs. Start it from an event of src/frontend/notes/event/."]
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
    expect(messagesWith(files)).toEqual([]);

    const notes = `${FRONTEND_MAP_IMPORTS}import { ThemeAsked } from "#frontend-shared/event/ThemeAsked.js";\n\nexport default [when(ThemeAsked, () => [new NoteLabelChosen()]), share(NoteLabelChosen, () => [new LabelChosen()])];\n`;
    expect(violationsWith({ ...files, [frontendMap]: notes })).toEqual([["context-maps-without-cycle", alertsMap]]);
    expect(checkWith({ ...files, [frontendMap]: notes }).map(({ file, line, message }) => [file, line, message])).toEqual([[
      alertsMap,
      6,
      "The context maps of the frontend make a cycle of events, AlertShown → ThemeAsked → NoteLabelChosen → LabelChosen → AlertShown, which the buses would carry without end, and the page would stop. Remove one of its lines: AlertShown → ThemeAsked in src/frontend/alerts/context-map.ts, or ThemeAsked → NoteLabelChosen in src/frontend/notes/context-map.ts, or NoteLabelChosen → LabelChosen in src/frontend/notes/context-map.ts, or LabelChosen → AlertShown in src/frontend/alerts/context-map.ts."
    ]]);
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
      'src/frontend/marko.json is missing, so the contexts cannot place them by their tag. Write `{ "tags-dir": "./shared/presentation/component" }` in src/frontend/marko.json.'
    ]]);
  });

  test("a marko.json that gives another folder of tags is not enough", () => {
    const other = folderWith({ "src/frontend/marko.json": '{ "tags-dir": ["./tags"] }\n', "src/frontend/tags/keep": "" });
    const sources = Object.entries(project).map(([path, text]) => ({ path, text }));
    const { violations } = checkArchitecture(other, sources, rules);
    rmSync(other, { recursive: true, force: true });

    expect(violations.map(({ rule, file, message }) => [rule, file, message])).toEqual([[
      "shared-components-are-tags",
      "src/frontend/marko.json",
      'src/frontend/marko.json does not give Marko the folder of the components of shared, so the contexts cannot place them by their tag. Write `{ "tags-dir": "./shared/presentation/component" }` in src/frontend/marko.json.'
    ]]);
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
    expect(violationsWith({ [entity]: 'import "#frontend-shared/presentation/component/badge/badge.js";\n\nexport class Note {}\n' })).toEqual([["domain-imports-no-presentation", entity]]);
  });
});


