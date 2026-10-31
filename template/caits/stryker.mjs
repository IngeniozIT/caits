import { globSync } from "node:fs";

/**
 * The code that Stryker changes, without its tests, contracts and test bindings, nor the bindings of the frontend. Stryker warns of a
 * pattern that matches no file, as in a project without code yet, or without a frontend context: only the patterns that match files.
 */
const MUTATE = ["src/**/*.ts", "!src/**/*.test.ts", "!src/**/*.contract.ts", "!src/**/test.di.ts", "!src/frontend/*/di.ts"]
  .filter(pattern => globSync(pattern.replace(/^!/, "")).length > 0);

/**
 * The mutation tests. Stryker runs the unit tests in Vitest, which stays started from one mutant to the next: for each mutant, the tests
 * that run its code. A counter stops the code of a mutant that loops without end.
 */
export default {
  testRunner: "vitest",
  // The tests find the code through the discovery of CAITS too, not only through their imports: the first run runs them all, and tells
  // which test runs which code. The pool of Vitest by default: a fork of Node for the tests.
  vitest: { configFile: "quality/vite.config.ts", related: false, pool: "forks" },
  // A new project has no test yet. As soon as there is code, its mutants have no coverage, and fail the check.
  allowEmpty: true,
  checkers: ["typescript"],
  tsconfigFile: "quality/caits/tsconfig.mutation.json",
  mutate: MUTATE,
  reporters: ["progress", "json", "html"],
  htmlReporter: { fileName: "reports/mutation/index.html" },
  jsonReporter: { fileName: "reports/mutation/mutation.json" },
  tempDirName: ".stryker-tmp",
  cleanTempDir: true,
  thresholds: { high: 100, low: 100, break: 100 },
  concurrency: "100%",
  timeoutMS: 15000,
  // A static mutant changes code that runs as a module loads, as a constant: all the tests that load it run it, and Stryker warns that
  // they take time. CAITS tests them all, and counts as killed one whose code throws as soon as a test loads it (`caits mutation`).
  warnings: { slow: false },
  // The builds stay out of the sandbox: under `caits check`, the end-to-end tests empty dist/ while Stryker copies the project.
  ignorePatterns: ["reports", "test-results", "playwright-report", "dist", ".marko-run"]
};
