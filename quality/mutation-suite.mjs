// `caits mutation-suite`: the command that Stryker runs for each mutant. It runs the unit tests from a private copy of the sandbox.
// Stryker runs many suites at once in a single sandbox, and every Vitest start rewrites the files that the Marko plugin generates
// (dist/, .marko-run/): suites that run at the same time would fail at random, and a failed run counts as a killed mutant.
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { constants, tmpdir } from "node:os";
import { join } from "node:path";

const ENTRIES = ["src", "test", "quality", "dist", ".marko-run", "package.json", "tsconfig.json"];

/** @param {string[]} args the options of Vitest, which Stryker gives */
export async function run(args) {
  const sandbox = process.cwd();
  const copy = mkdtempSync(join(tmpdir(), "caits-mutation-"));
  const remove = () => rmSync(copy, { recursive: true, force: true });
  for (const entry of ENTRIES) {
    if (existsSync(join(sandbox, entry))) cpSync(join(sandbox, entry), join(copy, entry), { recursive: true });
  }
  symlinkSync(join(sandbox, "node_modules"), join(copy, "node_modules"));

  // The suite builds in the dist/ of its copy: the build folder that `caits check` gives (CAITS_OUT_DIR) is in node_modules/, which the
  // suites share.
  const { CAITS_OUT_DIR: _, ...env } = process.env;
  const suite = spawn("npx", ["vitest", "run", "--config", "quality/vite.config.ts", "--reporter=dot", ...args], { cwd: copy, env, stdio: "inherit" });
  // Stryker stops a suite that takes too long: the copy goes away with it. The exit code tells the signal: 130 for SIGINT, 143 for SIGTERM.
  for (const signal of /** @type {const} */ (["SIGINT", "SIGTERM"])) process.on(signal, () => { suite.kill(signal); remove(); process.exit(128 + constants.signals[signal]); });
  /** @type {number} */
  const status = await new Promise(resolve => suite.on("close", code => resolve(code ?? 1)));
  remove();
  return status;
}
