# Changelog

The changes of each version of CAITS, the newest first. A version is a git tag, and a version of the package `caits` on npm: `npx caits@<version> init my-app`.

## Unreleased

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

- `caits --version` gives the version. `caits <command> --help` gives the usage.
- An unknown command or option, an option without its value, or an argument too many gives a short message and ``Run `caits --help`.``, with the exit code 1, in place of a stack trace. So do `caits architecture` without quality/architecture.mjs and `caits mutation-summary` without a report.
- `caits update` takes no argument: `caits update --help` no longer writes quality/caits/.
- `init` reads the package.json of the project before it writes a file, and names the file when it is not valid JSON. It says when git, npm or npx is not installed. It refuses an example with a symbolic link. Its next steps put a folder with a space in quotes.
- `caits check` exits with 143 on SIGTERM, and `caits mutation-suite` with 130 on SIGINT.
- `caits architecture` writes `1 architecture violation.` and `2 architecture violations.`, not `violation(s)`.

### Package

- CAITS is on npm, as the package `caits`: `npx caits init my-app --example` makes a project, and a project depends on `caits` `^0.5.0` in place of the git tag of GitHub. Its imports start with `caits/` in place of `@ingeniozit/caits/`: in a project, replace the name in package.json and in the imports, then run `npm install` and `npx caits update`.
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
