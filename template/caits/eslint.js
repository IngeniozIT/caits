import js from "@eslint/js";
import { join } from "node:path";
import tseslint from "typescript-eslint";
import { writeRouteTypes } from "@ingenioz-it/caits/quality/route-types";

/** This file is in quality/caits/: the root of the project is two folders up. */
const root = join(import.meta.dirname, "../..");

// The lint checks the types of the handlers of the routes, which use the global `Run` of @marko/run: its types are in
// .marko-run/routes.d.ts, which git ignores. They are written again first, so that they exist, also in a new clone, and follow the routes.
await writeRouteTypes(root);

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", ".marko-run/**", ".stryker-tmp/**", "coverage/**", "reports/**", "test-results/**", "quality/**/*.{js,mjs}", "**/*.marko"] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: root } },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
      "no-empty-pattern": ["error", { allowObjectPatternsAsParameters: true }]
    }
  },
  {
    files: ["test/**/*.ts", "src/**/*.test.ts", "src/**/*.contract.ts", "src/**/test.di.ts"],
    rules: { "@typescript-eslint/unbound-method": "off", "@typescript-eslint/no-unsafe-assignment": "off", "@typescript-eslint/no-unsafe-member-access": "off", "@typescript-eslint/no-unsafe-argument": "off", "@typescript-eslint/no-unsafe-call": "off", "@typescript-eslint/require-await": "off", "@typescript-eslint/no-empty-function": "off" }
  }
);
