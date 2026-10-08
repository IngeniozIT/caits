import { fileURLToPath } from "node:url";
import marko from "@marko/run/vite";
import { defineConfig } from "vitest/config";
import { kernel } from "@ingeniozit/caits/vite";

/**
 * The folder of the stylesheets of the app. Sass looks in it after the folder of a stylesheet: each stylesheet of the routes loads the
 * partials of style/ by their name (`@use "values"`), from any folder. The architecture check reads the same load path: a context
 * does not load the stylesheets of the routes.
 */
const STYLE_FOLDER = fileURLToPath(new URL("../../src/routes/_frontend/style", import.meta.url));

export default defineConfig({
  plugins: [marko(), kernel()],
  css: { preprocessorOptions: { scss: { loadPaths: [STYLE_FOLDER] } } },
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
