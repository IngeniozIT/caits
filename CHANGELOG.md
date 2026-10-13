# Changelog

The changes of each version of CAITS, the newest first. A version is a git tag, and a version of the package `@ingenioz-it/caits` on npm: `npx @ingenioz-it/caits@<version> init my-app`.

## Unreleased

### Architecture

- The routes hold no logic and no test. The rule `frontend-routes-content` takes in `component/` only the components of Marko and their stylesheets: a module of TypeScript, or a test, goes in a context, where the layers and their tests are. In a project that has some in `src/routes/_frontend/component/`, move them into a frontend context: the code into its layers, and the components that use it into its views.
- The frontend gives its pages in other formats than HTML: a sitemap, a feed, llms.txt. The route of such a document is a folder named after its file, as a page has its folder: `` `sitemap.xml`/+handler.ts `` for `/sitemap.xml`, `` blog/`rss.xml`/+handler.ts `` for `/blog/rss.xml`. Its `+handler.ts` only gives the GET of a view of a frontend context, `export { sitemap as GET } from "#frontend/site/presentation/view/sitemap/sitemap.js";`: the view makes the document from what its context knows, with its test. Before, these documents were files of `public/`, written by hand next to the pages: the frontend routes held no handler, and a handler of `_backend` gives the request to a backend context, which does not read the frontend.
- The presentation of a frontend context holds components, besides its views: `presentation/component/<component>/`, the parts that its views place. A component may take the frontend of its context, publish its events and read its store, as a view does; it imports no view (`components-import-no-view`). A view imports nothing from another view (`views-import-no-view`): what views share is a component. In a project where a view imports the files of another, move them into a component.
- A frontend context may have no store: a context without a use case, whose views and components publish events and read no state. Its frontend is its bus. A context with use cases and no store is refused, since the store sends their input DTOs. `testPresentation` gives no store for such a context, and records in `published` every event of the bus: a test reads the events that a view or a component publishes.
- The contexts talk through the context shared, in the backend as in the frontend: the context map of a context shares an event of the context as an event of shared, on the shared bus, and the context map of each context that hears it turns it into what the context reacts to. A context and its context map name only their own context and the context shared: two contexts never name each other.
  - Each context has its context map, `src/<side>/<context>/context-map.ts`, beside its di.ts. It translates both ways. `share(SomeEvent, event => [new SharedEvent(…)])` turns an event of the context into events of shared, on the shared bus: in the backend, an event that a handler published; in the frontend, one that a view, a component or a handler published on the bus of the context. `when(SharedEvent, event => […])` turns an event of shared into what the context reacts to: in the backend (`@ingenioz-it/caits/messaging/ContextMap`), input DTOs of the context, which its handlers execute (a line that gives the input of another context is reported, and sends nothing); in the frontend (`@ingenioz-it/caits/messaging/FrontendContextMap`), events of the context, on its own bus, which its store reads. The event of the context holds what the events of shared need: the map reads no state. The test of a map reads what its lines give: `inputsFor` and `eventsFor` of the `ContextMap` in the backend (`@ingenioz-it/caits/testing/backend/context-map`), `eventsFor` in the frontend (`@ingenioz-it/caits/testing/frontend/context-map`).
  - **Breaking**: in the backend, a handler publishes the events of its context, and no longer those of shared. An event that the context map does not share stays in its context. In a project where a handler publishes an event of shared, give its context an event of its own, `domain/event/`, publish it, and share it in the context map: `share(NoteAdded, event => [new NotePosted(event.id)])`. The handlers of the context shared still publish its events on the shared bus. The application test of a handler (`createTestApplication`, `applicationScenario`) reads the events of its context, and the test of a flow (`backendTest`) the events of shared: `subscribeToContexts` of the backend watches the first, `subscribe` the second.
  - In the frontend, the bus of the context shared is the shared bus of a $global (one request on the server, one page in the browser). A context that hears an event of shared is built if no view asked for it yet, and the frontend of shared when a context first shares an event. The components of shared publish its events on its own bus, the shared bus. A context without a store tells the other contexts as well: its map shares the events that its views publish.
  - A view or a component takes only the frontend of its context (`views-take-own-frontend`), and in a context other than shared, only the context map imports the events of shared, in the backend as in the frontend (`shared-events-in-map`): the handlers, the entities, the controllers, the store, the views and the components name only the events of their context. A test may import them. The test of a view reads in `published` the event of the context that it publishes, and the test of the map what the map shares.
  - The rules read the lines of the context maps. A map has one export, the list of its lines, made with the `when` and the `share` of the kernel for its side (`context-map-holds-lines`). Each line goes one way (`context-map-line-direction`): `share` starts from an event of its context and gives events of shared, `when` starts from an event of shared and gives what its context reacts to. A line that goes the other way never starts, and its test passes all the same. In the frontend, the maps make no cycle of events, in one map or across several (`context-maps-without-cycle`): the buses carry an event at once, and a cycle would never end.
  - The lint keeps a context map a translation (quality/caits/eslint.js): it reads neither the clock (`Date.now()`, `new Date()`), nor chance (`Math.random()`, `crypto`), nor the page or the process (`window`, `document`, `localStorage`, `fetch`, `process`…), and keeps no state (no `let` at the top of the file). The event that it translates holds what the new events need.
  - A context map imports only the events of its context and of shared, the input DTOs of its context in the backend, and the values of the domain (`context-map-translates-shared`). No layer imports it: the kernel reads it (`layer-direction`). The context shared has none (`shared-hears-no-context`).
  - **Breaking**: the context map of the backend, `src/backend/context-map.ts`, is gone, and with it the rules `context-map-reads-events-and-dtos`, `context-map-without-routes` and `routes-without-context-map`; `src/backend` holds only the contexts, and the integration tests of the whole backend (`*.integration.test.ts`). In a project that has one, move each event that a context hears into the backend context shared (`domain/event/`), and each line of the map into the context map of the context that reacts.
- The frontend has a context shared, `src/frontend/shared/`, as the backend has: a context as the others, with its di.ts, and its store if it needs one, that every context of the frontend may import. The contexts import its files with the shortcut `#frontend-shared/`, which the plugin of the kernel gives Vite and quality/caits/tsconfig.json gives TypeScript (`#shared/` stays the backend context shared). They place its components by their tag, `<badge>`, and do not import their file (`shared-components-placed-by-tag`): Marko reads the import of a template from the package.json of the context, whose shortcuts lead only into it, and would not build it. A component of shared is a Marko tag, `component/<name>/index.marko`, and `src/frontend/marko.json` gives Marko the folder of these tags, `{ "tags-dir": "./shared/presentation/component" }` (`shared-components-are-tags`: write it with the first component of shared).
- The architecture check reads a tag that Marko finds without an import (in a folder of tags) from the root of the project: the rules on the direction of the imports read it, and `imports-by-shortcut` no longer takes it for an import that goes up a folder.
- In a project, run `npm update` and `npx caits update`. The AGENTS.md of a new project says where these routes go, that the routes hold no test, where the components and the context shared of the frontend go: in a project made before, add it to the lines on `src/routes/` and on the presentation.

### Kernel

- The kernel refuses, when it starts, a di.ts that gives something other than a binding: before, it lost it without a word. The empty di.ts of a context shared that holds only events, `export default [];`, thus passes the mutation tests. It refuses as well a context map that is not a list of lines, or a line of the other side: a `when` of the backend in a map of the frontend.

## 0.5.1

### Command

- `npm run test:mutation` gives the mutants that survived when the score is under 100%. It runs `caits mutation`: Stryker, then the score of each file and the survivors, whether Stryker passed or not, with the exit code of Stryker. Before, the script stopped after Stryker when it failed, and its summary showed only when every mutant was killed. A run that stops before its report shows no summary of the run before.
- In a project made with 0.5.0, change the script in package.json: `"test:mutation": "caits mutation"`. Then run `npm update` and `npx caits update`.

## 0.5.0

### Development

- `npm run tdd` is plain watch mode (`vitest --config quality/vite.config.ts`): it runs the unit tests, then at each save the tests of the changed files. Before, it ran no test when no file differed from the last commit, or out of a git repository. `init` no longer writes the script `test:watch`, which was the same.
- In watch mode and in the development server, a new handler, DTO, controller, di.ts, store or context map is found at once: no restart of Vitest or of the server. Before, the tests failed with `No context owns …`.
- `npm run lint:code` passes on a new project or a new clone: the ESLint configuration of CAITS (quality/caits/eslint.js) writes the types of the routes (.marko-run/routes.d.ts) first. Before, the lint failed when no build, test or development server had written them.

### End-to-end tests

- `caits e2e` refuses to run when the port of the server is in use (`Port 4310 is in use: a server runs at http://127.0.0.1:4310/ already. Stop it, then run the end-to-end tests again.`): before, it ran the tests on that server, which could be the build of another project.
- `caits e2e` stops the server, Playwright and its browsers also on Ctrl+C (exit code 130) and SIGTERM (143), and waits for the server as long as `webServer.timeout` says (120 s when it says nothing).
- The folder of the data of the end-to-end server (DATA_DIR) has a name for each path of project: two projects with the same folder name no longer share it. `caits e2e` empties it before it starts the server; the global setup of Playwright that emptied it again (quality/e2e-setup.mjs) is removed.

### Kernel

- `readBody` reads only a body that says it is JSON (`content-type: application/json`, or a type with the suffix `+json`): else the Controller answers 415 `urn:caits:problem:unsupported-media-type`. A browser sends a body of another type from any site without asking the server first. A body larger than 1 MB (`MAX_BODY_SIZE`, or the size that the second argument gives) gets 413 `urn:caits:problem:request-body-too-large`.
- `presentationScenario(app).givenTheRequest(method, path, body)` sends each body with `content-type: application/json`, also a body that is a string.

### Command

- The AGENTS.md of a new project says that, in an AI agent, `npm run tdd` runs the unit tests once and stops: Vitest does not watch there.
- `caits --version` gives the version. `caits <command> --help` gives the usage.
- An unknown command or option, an option without its value, or an argument too many gives a short message and ``Run `caits --help`.``, with the exit code 1, in place of a stack trace. So do `caits architecture` without quality/architecture.mjs and `caits mutation-summary` without a report.
- `caits update` takes no argument: `caits update --help` no longer writes quality/caits/.
- `init` reads the package.json of the project before it writes a file, and names the file when it is not valid JSON. It says when git, npm or npx is not installed. It refuses an example with a symbolic link. Its next steps put a folder with a space in quotes.
- `caits check` exits with 143 on SIGTERM, and `caits mutation-suite` with 130 on SIGINT.
- `caits architecture` writes `1 architecture violation.` and `2 architecture violations.`, not `violation(s)`.

### Package

- CAITS is on npm, as the package `@ingenioz-it/caits`: `npx @ingenioz-it/caits init my-app --example` makes a project, and a project depends on `@ingenioz-it/caits` `^0.5.0` in place of the git tag of GitHub. Its imports start with `@ingenioz-it/caits/` in place of `@ingeniozit/caits/`: in a project, replace the name in package.json and in the imports, then run `npm install` and `npx caits update`. npm refuses the name `caits`, too close to the names of other packages.
- git is necessary only for `init --example`, which gets the example with git.
- Node.js 22.18 or later is necessary in Node 22 (`^22.18.0 || ^24.0.0 || >=26.0.0`): from 22.18, Node strips the types of TypeScript without an option.
- The peer dependencies give the versions that CAITS supports: `@marko/run` `^0.11.13`, `vite` `^8.0.0`, `vitest` `^5.0.0`, and the packages that the defaults of CAITS import (`@marko/compiler`, `@playwright/test`, `@eslint/js`, `typescript-eslint`). package.json has a homepage, a page for the issues, an author and keywords.
- The type check and the lint of CAITS also read the tools of quality/.

## 0.4.1

- `init --example` gets the example over HTTPS: a computer without an SSH key for GitHub can get it.
- CAITS has the license 0BSD.
- The documentation moves from the wiki to [caits.dev](https://caits.dev/docs).

## 0.4.0

- `caits check` runs all the checks at once (the mutation tests too), and shows only the output of the checks that fail. `npm run check` runs it.
- `init` writes an AGENTS.md in a new project: the commands, the place of each file and the rules, for the AI agents.
- `init --example` gets the example from its own repository, [IngeniozIT/caits-example](https://github.com/IngeniozIT/caits-example), at the tag of the version, or from `--example-source`.
- The apps have their styles in SCSS, and the architecture check reads the stylesheets.
- `caits dev` keeps its pages after a build, and restarts when its configuration changes.

## 0.3.0

- `caits init --example` writes a small app of messages that shows each layer and each kind of test, and passes all the checks.
- The problems of the API have the type `urn:caits:problem:…`.

## 0.2.0

- The command `caits`: `init` makes a project, or adds CAITS to one, and installs it; `update` writes again the defaults of the tools in quality/caits/; `dev`, `architecture`, `e2e`, `mutation-summary` and `mutation-suite` run the tools.
- A project owns its files of quality/: each one imports the defaults of CAITS and changes them.

## 0.1.0

- The kernel of CAITS in a repository of its own, as the package `@ingeniozit/caits`: the container of the dependencies, the message buses, the Controller, the stores of the frontend, the Vite plugin, the test helpers and the architecture check.
- A project installs it from git: the Vite plugin is JavaScript.
- The code imports by the shortcuts `#context` and `#shared`, not with `../`.
