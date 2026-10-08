import marko from "@marko/run/vite";
import { defineConfig } from "vitest/config";
import { kernel } from "@ingeniozit/caits/vite";

export default defineConfig({
  plugins: [marko(), kernel()],
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts", "quality/**/*.test.mjs"],
    // A new project has no test yet. The coverage asks for the tests of the code as soon as there is code.
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.contract.ts", "src/**/test.di.ts", "src/frontend/*/di.ts"],
      reporter: ["text-summary", "text", "html"],
      reportsDirectory: "reports/coverage",
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 }
    }
  }
});
