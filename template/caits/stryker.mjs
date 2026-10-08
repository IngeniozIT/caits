/** The mutation tests. Stryker runs `caits mutation-suite` for each mutant: the unit tests, in a private copy of its sandbox. */
export default {
  testRunner: "command",
  commandRunner: { command: "caits mutation-suite --bail=1 --no-isolate --maxWorkers=1" },
  checkers: ["typescript"],
  tsconfigFile: "quality/caits/tsconfig.mutation.json",
  mutate: ["src/**/*.ts", "!src/**/*.test.ts", "!src/**/*.contract.ts", "!src/**/test.di.ts", "!src/frontend/*/di.ts"],
  reporters: ["progress", "json", "html"],
  htmlReporter: { fileName: "reports/mutation/index.html" },
  jsonReporter: { fileName: "reports/mutation/mutation.json" },
  tempDirName: ".stryker-tmp",
  cleanTempDir: true,
  thresholds: { high: 100, low: 100, break: 100 },
  concurrency: "100%",
  timeoutMS: 15000,
  coverageAnalysis: "off",
  ignorePatterns: ["reports", "test-results", "playwright-report"]
};
