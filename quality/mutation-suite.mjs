// `caits mutation-suite`: the command that Stryker runs for each mutant. It runs the unit tests from a private copy of the sandbox.
// Stryker runs many suites at once in a single sandbox, and every Vitest start rewrites the files that the Marko plugin generates
// (dist/, .marko-run/): suites that run at the same time would fail at random, and a failed run counts as a killed mutant.
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ENTRIES = ["src", "test", "quality", "dist", ".marko-run", "package.json", "tsconfig.json"];

export async function run(args) {
  const sandbox = process.cwd();
  const copy = mkdtempSync(join(tmpdir(), "caits-mutation-"));
  const remove = () => rmSync(copy, { recursive: true, force: true });
  for (const entry of ENTRIES) {
    if (existsSync(join(sandbox, entry))) cpSync(join(sandbox, entry), join(copy, entry), { recursive: true });
  }
  symlinkSync(join(sandbox, "node_modules"), join(copy, "node_modules"));

  const suite = spawn("npx", ["vitest", "run", "--config", "quality/vite.config.ts", "--reporter=dot", ...args], { cwd: copy, stdio: "inherit" });
  // Stryker stops a suite that takes too long: the copy goes away with it.
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { suite.kill(signal); remove(); process.exit(143); });
  const status = await new Promise(resolve => suite.on("close", code => resolve(code ?? 1)));
  remove();
  return status;
}
