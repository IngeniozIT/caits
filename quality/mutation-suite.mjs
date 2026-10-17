// `caits mutation-suite`: the command that Stryker runs for each mutant. It runs the unit tests from a private copy of the sandbox.
// Stryker runs many suites at once in a single sandbox, and every Vitest start rewrites the files that the Marko plugin generates
// (dist/, .marko-run/): suites that run at the same time would fail at random, and a failed run counts as a killed mutant.
// The copy shares the packages of the sandbox, not the caches that the tools keep beside them (node_modules/.vite/, .vitest-cache/…): the
// cache of Vite depends on the folder of the project, so each suite would write it again while the others read it.
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { constants, tmpdir } from "node:os";
import { join } from "node:path";
import { painterOf } from "./terminal.mjs";

const ENTRIES = ["src", "test", "quality", "dist", ".marko-run", "package.json", "tsconfig.json"];

/** The report of Vitest, in the copy: Vitest writes it once the tests ran, also when one fails. */
const REPORT = "vitest-report.json";

/**
 * What the suite prints when the unit tests did not run. Stryker counts the mutant as killed, as for any exit code but 0:
 * `caits mutation-summary` finds these words in the report of Stryker, and does not.
 */
export const NOT_RUN = "The unit tests did not run";

/** The copies, in the temporary folder: `caits-mutation-<pid of their suite>-<random>`. */
const COPY = /^caits-mutation-(\d+)-/;

/** @param {string[]} args the options of Vitest, which Stryker gives */
export async function run(args) {
  removeOrphans();
  const sandbox = process.cwd();
  const copy = mkdtempSync(join(tmpdir(), `caits-mutation-${process.pid}-`));
  const remove = () => rmSync(copy, { recursive: true, force: true });
  for (const entry of ENTRIES) {
    if (existsSync(join(sandbox, entry))) cpSync(join(sandbox, entry), join(copy, entry), { recursive: true });
  }
  // The packages and their commands (.bin/). The other entries that start with a dot are the caches and the files of the tools.
  mkdirSync(join(copy, "node_modules"));
  for (const entry of readdirSync(join(sandbox, "node_modules"))) {
    if (!entry.startsWith(".") || entry === ".bin") symlinkSync(join(sandbox, "node_modules", entry), join(copy, "node_modules", entry));
  }

  // The suite builds in the dist/ of its copy: the build folder that `caits check` gives (CAITS_OUT_DIR) is in node_modules/, which the
  // suites share.
  const { CAITS_OUT_DIR: _, ...env } = process.env;
  const vitest = ["vitest", "run", "--config", "quality/vite.config.ts", "--reporter=dot", "--reporter=json", `--outputFile.json=${REPORT}`, ...args];
  const suite = spawn("npx", vitest, { cwd: copy, env, stdio: "inherit" });
  // Ctrl+C and `caits check` stop the suite: the copy goes away with it. The exit code tells the signal: 130 for SIGINT, 143 for SIGTERM.
  for (const signal of /** @type {const} */ (["SIGINT", "SIGTERM"])) process.on(signal, () => { suite.kill(signal); remove(); process.exit(128 + constants.signals[signal]); });
  /** @type {number} */
  const status = await new Promise(resolve => suite.on("close", code => resolve(code ?? 1)));
  const ran = existsSync(join(copy, REPORT));
  remove();
  // Vitest stopped before the tests, on an error of its own or of the system: no test failed, and the mutant is not tested.
  if (status !== 0 && !ran) console.error(painterOf(process.stderr)("red", `${NOT_RUN}: Vitest stopped before them (exit ${status}). The mutant is not tested.`));
  return status;
}

/**
 * Stryker stops a suite that takes too long with SIGKILL, which no code can follow: its copy stays. Each suite removes the copies whose
 * suite no longer runs.
 */
function removeOrphans() {
  for (const entry of readdirSync(tmpdir())) {
    const pid = COPY.exec(entry)?.[1];
    if (pid === undefined || runs(Number(pid))) continue;
    try {
      rmSync(join(tmpdir(), entry), { recursive: true, force: true });
    } catch {
      // The copy of another user.
    }
  }
}

/** @param {number} pid */
function runs(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process runs, but belongs to another user.
    return /** @type {NodeJS.ErrnoException} */ (error).code === "EPERM";
  }
}
