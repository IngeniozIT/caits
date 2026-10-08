import { fileURLToPath } from "node:url";
import marko from "@marko/run/vite";
import { defineConfig } from "vitest/config";
import { kernel, wholeRouteTypes } from "@ingeniozit/caits/vite";

/**
 * The folder of the stylesheets of the app. Sass looks in it after the folder of a stylesheet: each stylesheet of the routes loads the
 * partials of style/ by their name (`@use "values"`), from any folder. The architecture check reads the same load path: a context
 * does not load the stylesheets of the routes.
 */
const STYLE_FOLDER = fileURLToPath(new URL("../../src/routes/_frontend/style", import.meta.url));

export default defineConfig({
  plugins: [wholeRouteTypes(), marko(), kernel()],
  // `caits check` runs the checks at once: it gives each one a build folder of its own (CAITS_OUT_DIR), else they empty the folder of
  // each other. Without it, the build goes in dist/, which `npm start` runs.
  build: { outDir: process.env.CAITS_OUT_DIR || "dist" },
  // The checks write their reports while the development server runs: a report is not a file of the app, and reloads no page.
  server: { watch: { ignored: ["**/reports/**"] } },
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
