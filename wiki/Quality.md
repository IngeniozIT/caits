# Quality

This page tells how a project changes the rules and the settings of its tools.

## The two kinds of files

| Files | Owner | What they hold |
|---|---|---|
| `quality/caits/*` | CAITS | The defaults of CAITS. `npx caits update` writes them again: do not change them. |
| `quality/*`, `tsconfig.json` | The project | The configuration of the project. Each file imports the defaults of CAITS, then changes them. CAITS never changes these files. |

Your file has the last word: what it removes, replaces or adds is what the tool uses.

## The architecture rules

`caits architecture` checks the rules that `quality/architecture.mjs` exports. Each rule is an object with a name, a description, the kind of thing that it reads (`on`), and a check.

Remove a rule:

```js
import { rules } from "./caits/architecture.mjs";

export default rules.filter(rule => rule.name !== "routes-folders");
```

Add a rule:

```js
import { locate } from "@ingeniozit/caits/quality/architecture";
import { rules } from "./caits/architecture.mjs";

const noTodoInDomain = {
  name: "no-todo-in-domain",
  description: "The domain holds no TODO.",
  on: "file",
  production: true,
  check: ({ path, strings }) => locate(path).layer === "domain" && strings.some(text => text.includes("TODO")) && "no TODO in the domain"
};

export default [...rules, noTodoInDomain];
```

To replace a rule, remove it, then add your own rule with the same name.

A check gives nothing when the rule holds. Otherwise, it gives the message, or a list of messages. `on` tells what the check reads:

| `on` | The check reads |
|---|---|
| `"import"` | Each import of the production code: `{ file, from, to, specifier, internal, target }`. |
| `"file"` | Each file, and the project. With `production: true`, the test files stay out. |
| `"project"` | The project, once. The check gives a list of `{ file, message }`. |

`@ingeniozit/caits/quality/architecture` gives what the rules of CAITS use: `locate`, `isCore`, `portOf`, `adapterOf`, `resolveImport`… Read `quality/caits/architecture.mjs` for examples.

To test your rules, write `quality/*.test.mjs` with `checkArchitecture(root, sources, rules)` of the same module. `npm test` runs these tests.

## ESLint

`quality/eslint.config.js` is a list. ESLint applies the entries in their order, so your entries win over those of CAITS:

```js
import caits from "./caits/eslint.js";

export default [
  ...caits,
  { files: ["src/**/*.ts"], rules: { "no-console": "error" } }
];
```

## Vite and Vitest

`quality/vite.config.ts` is the configuration of the build, of the development server and of the unit tests. `mergeConfig` adds your settings to those of CAITS:

```ts
import { mergeConfig } from "vitest/config";
import caits from "./caits/vite.ts";

export default mergeConfig(caits, {
  test: { coverage: { thresholds: { branches: 90 } } }
});
```

`mergeConfig` adds to the lists (for example `plugins` and `test.include`). To replace a list, change it after the merge.

## Playwright and Stryker

Your values replace those of CAITS. To change one value of an object, copy the others:

```ts
export default defineConfig({
  ...caits,
  use: { ...caits.use, locale: "fr-FR" }
});
```

`caits e2e` reads `webServer` from `quality/playwright.config.ts`: if you change the port or the command of the server, the command uses your values.

## TypeScript

`tsconfig.json` extends `quality/caits/tsconfig.json`. Add your options next to `extends`: they replace those of CAITS.

```json
{
  "extends": "./quality/caits/tsconfig.json",
  "compilerOptions": { "noUnusedParameters": true }
}
```
