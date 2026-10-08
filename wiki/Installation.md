# Installation

This page tells how to make a new project with CAITS, how to add CAITS to a project, and how to update CAITS. One command makes the project. At the end, the project passes all its checks and starts.

## What you need

| Tool | Version |
|---|---|
| Node.js | 22.18 or later, in version 22, 24, or 26 and later. Vitest does not support versions 23 and 25. |
| git | Any version. npm uses git to get CAITS from GitHub. |

You must also have read access to the GitHub repository `IngeniozIT/caits`. The repository is private: npm gets it with git over SSH. Your SSH key must give access to it. If the key has a passphrase, add the key to your SSH agent first (`ssh-add`).

## Make a new project

```sh
npx github:IngeniozIT/caits#v0.3.0 init my-app
cd my-app
npm run check
```

The first line makes the project in the folder `my-app`:

1. It writes the files of the project (see [What the command writes](#what-the-command-writes)).
2. It writes `package.json`, with the scripts and the packages.
3. It installs the packages, with `npm install`.
4. It installs the browser of the end-to-end tests, with `npx playwright install chromium`.

`npm run check` makes sure that the installation is correct: it builds the app, checks the types, the lint and the architecture, and runs the tests. Then `npm run dev` starts the app on http://localhost:3000. The page shows "My app".

To start from a small app that shows each layer and each kind of test, add `--example`: `init my-app --example`. See [Example](Example.md).

## Add CAITS to a project

In the folder of the project:

```sh
npx github:IngeniozIT/caits#v0.3.0 init
```

- The command writes only the files that the project does not have. It does not change the other files.
- It adds to `package.json` only the values that it does not have: scripts, packages, `type`, `imports`, `engines`.
- It adds to `.gitignore` the lines that it does not have.
- It tells which files and which values of the project it kept. Compare them with those of `node_modules/@ingeniozit/caits/template/project/`.

Without a folder name, the command works only in a folder that has a `package.json`. This prevents a project in a wrong folder. To use an empty folder, give its name, or `.` for the current folder.

## What the command writes

```
my-app/
├── package.json
├── tsconfig.json        extends quality/caits/tsconfig.json
├── .gitignore
├── .nvmrc
├── quality/             the configuration of the tools: these files are yours
│   ├── architecture.mjs
│   ├── eslint.config.js
│   ├── playwright.config.ts
│   ├── stryker.config.mjs
│   ├── vite.config.ts
│   └── caits/           the defaults of CAITS: CAITS owns these files
├── src/
│   ├── backend/         the contexts of the backend, one folder for each context
│   ├── frontend/        the contexts of the frontend, one folder for each context
│   └── routes/_frontend/+page.marko   the first page
└── test/e2e/home.spec.ts              the first end-to-end test

With --example, src/ and test/e2e/ hold the example app instead (see Example.md).
```

Each file of `quality/` imports the defaults of CAITS from `quality/caits/`, then changes them. Your file has the last word. To change a rule or a setting, see [Quality](Quality.md).

Do not change the files of `quality/caits/`: `npx caits update` writes them again.

## Update CAITS

```sh
npm install --save-dev github:IngeniozIT/caits#v0.4.0
npx caits update
```

1. `npm install` gets the new version of CAITS: its code and its commands.
2. `npx caits update` writes the defaults of the new version in `quality/caits/`. It does not change your files.
3. Look at the changes with `git diff quality/caits/`. Then run `npm run check`.

If you forget step 2, the commands of CAITS (`caits architecture`, `caits e2e`…) show a warning: the version of `quality/caits/` is not the version of CAITS.

`npm update` does not change the version of CAITS: the tag after `#` sets it.

## The versions of the tools

CAITS suggests a version for each tool: the version that CAITS uses itself. The project chooses.

- `init` writes the suggested versions in `package.json`. After that, the versions are yours.
- `npx caits update` tells which packages have a version that is not the one that CAITS suggests. It does not change them.

## The scripts

| Script | What it does |
|---|---|
| `npm run dev` | Starts the app on http://localhost:3000 (or on the port `PORT`). |
| `npm run tdd` | Runs the tests of the files that you changed, again at each change. |
| `npm test` | Runs all the unit tests. |
| `npm run check` | Runs all the checks: types, lint, architecture, unit tests and end-to-end tests. Run it before a commit. |
| `npm run quality` | Runs `check`, then the coverage, and writes the documentation of the tests (`reports/test-docs/index.html`). |
| `npm run test:mutation` | Runs the mutation tests. |

The scripts are yours: you can change them. Some scripts run a command of CAITS:

| Command | What it does |
|---|---|
| `caits dev` | Starts the development server with `quality/vite.config.ts`. |
| `caits architecture` | Checks the rules of `quality/architecture.mjs` on `src/` and `test/`. |
| `caits e2e` | Starts the server of `quality/playwright.config.ts`, then runs the end-to-end tests. |
| `caits mutation-summary` | Gives the mutation score of each file. With `--survivors`, it also gives the mutants that survived. |
| `caits update` | Writes the defaults of the installed CAITS in `quality/caits/`. |

## Options of `init`

| Option | What it does |
|---|---|
| `--example` | The command writes a small app in place of the first page: a menu, and a page where the user adds, edits and removes messages. See [Example](Example.md). |
| `--no-install` | The command writes the files, but installs nothing. Then run `npm install` and `npx playwright install chromium` yourself. |
| `--caits <source>` | npm gets CAITS from this source, for example `git+file:///path/to/caits#v0.3.0`. By default, the source is the tag of the version of the command on GitHub. |
