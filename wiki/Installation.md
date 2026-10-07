# Installation

This page tells how to add CAITS to a new project. At the end, the project builds, passes its type check and starts.

## What you need

| Tool | Version |
|---|---|
| Node.js | 22.12 or later, in version 22, 24, or 26 and later. Vitest does not support versions 23 and 25. |
| git | Any version. npm uses git to get CAITS from GitHub. |

You must also have read access to the GitHub repository `IngeniozIT/caits`.

## 1. Make the project

Make a folder for the project. In this folder, write `package.json`:

```json
{
  "name": "my-app",
  "private": true,
  "type": "module",
  "imports": {
    "#backend/*": "./src/backend/*",
    "#frontend/*": "./src/frontend/*"
  },
  "scripts": {
    "dev": "marko-run dev",
    "build": "marko-run build",
    "start": "node dist/index.mjs",
    "test": "vitest run",
    "typecheck": "marko-run build && mtc"
  }
}
```

- `"type": "module"`: CAITS and the configuration files are ES modules.
- `imports`: the routes import the files of the contexts with the shortcuts `#backend/…` and `#frontend/…`.
- `typecheck` builds the app first: the build writes the types of the routes.

## 2. Install the packages

```sh
npm install github:IngeniozIT/caits#v0.1.0 marko @marko/run
npm install --save-dev vite vitest typescript@6 @types/node @marko/type-check happy-dom
```

| Package | Why |
|---|---|
| `@ingeniozit/caits` | CAITS. |
| `marko`, `@marko/run` | The pages and the routes. |
| `vite` | Builds the app. CAITS has a Vite plugin. |
| `vitest` | Runs the tests. The test helpers of CAITS use it. |
| `typescript@6`, `@marko/type-check` | Check the types of the `.ts` and `.marko` files. `@marko/type-check` uses TypeScript 6: install the same version. |
| `@types/node` | The types of Node.js, for example `process.env`. |
| `happy-dom` | A browser for the tests of the Views. |

The tag after `#` is the version of CAITS. `npm update` does not change this version. To get another version, install CAITS again with the new tag.

If the repository is private, npm uses your SSH key. Write the address in full: `git+ssh://git@github.com/IngeniozIT/caits.git#v0.1.0`.

## 3. Configure Vite

Write `vite.config.ts`:

```ts
import marko from "@marko/run/vite";
import { kernel } from "@ingeniozit/caits/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [marko(), kernel()]
});
```

The plugin of CAITS does two things:

- It writes the parameters of each constructor next to the class. The container reads them to give each class its dependencies. Thus the build can make the code smaller and change the names in it.
- It finds the contexts in `src/backend/` and `src/frontend/`. If your code is not in `src/`, give its folder: `kernel({ source: "app" })`.

Vitest reads the same file. You do not need a Vitest configuration.

## 4. Configure TypeScript

Write `tsconfig.json`:

```json
{
  "include": ["src", "vite.config.ts", ".marko-run/routes.d.ts"],
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["DOM", "ESNext"],
    "types": ["node"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "paths": { "#shared/*": ["./src/backend/shared/*"] }
  }
}
```

CAITS needs these options:

| Option | Why |
|---|---|
| `"moduleResolution": "bundler"` | CAITS gives its TypeScript files. TypeScript must find them as Vite does. |
| `"types": ["node"]` | TypeScript 6 adds no types by itself. This line adds the types of Node.js. |
| `"paths"` | The shortcut `#shared/…` leads to the context `shared` of the backend. The plugin of CAITS gives the same shortcut to Vite. |
| `.marko-run/routes.d.ts` in `include` | The types of the routes. `marko-run build` writes this file. |

TypeScript also checks the files of CAITS with these options.

## 5. Make the folders

```
my-app/
├── package.json
├── tsconfig.json
├── vite.config.ts
└── src/
    ├── backend/       the contexts of the backend, one folder for each context
    ├── frontend/      the contexts of the frontend, one folder for each context
    └── routes/        the pages and the API routes of Marko Run
```

Write a first page, `src/routes/+page.marko`:

```marko
<!doctype html>
<html lang="en">
  <head>
    <title>My app</title>
  </head>
  <body>
    <h1>My app</h1>
  </body>
</html>
```

## 6. Make sure that the installation is correct

```sh
npm run typecheck
npm start
```

1. `npm run typecheck` builds the app, then checks the types. It shows no error.
2. `npm start` starts the app that you built. Open http://localhost:3000. The page shows "My app".

`npm test` stops with an error while the project has no test. The next pages tell how to add a context and its tests.
