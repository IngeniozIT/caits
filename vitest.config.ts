import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { kernel } from "./src/vite.ts";

// The tests of the kernel find the contexts of a small sample project, not those of an app. The sample imports the kernel by its name,
// as an app does: the name leads to the files of this folder, also in a copy of it (the sandbox of the mutation tests).
export default defineConfig({
  plugins: [kernel({ source: "test/project" })],
  resolve: { alias: [{ find: /^@ingeniozits\/kernel\//, replacement: fileURLToPath(new URL("./src/", import.meta.url)) }] },
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.d.ts", "src/testing/**", "src/vite.ts"],
      reporter: ["text-summary", "text", "html"],
      reportsDirectory: "reports/coverage",
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 }
    }
  }
});
