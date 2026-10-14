// `caits mutation`: the mutation tests (Stryker, with quality/stryker.config.mjs), then the score of each file and the mutants that
// survived, whether Stryker passed or not. Stryker alone ends with its threshold when the score is too low: the survivors say what to fix.
// The run fails also when a mutant is not tested, which Stryker counts as killed (`caits mutation-summary`).
import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { REPORT, run as summary } from "./mutation-summary.mjs";

/** The configuration of Stryker in a project: it imports the defaults of CAITS (quality/caits/stryker.mjs). */
export const STRYKER_CONFIG = "quality/stryker.config.mjs";

/**
 * @param {string[]} args the options of Stryker
 * @returns {Promise<number>} the exit code of Stryker, or 1 when a mutant is not tested
 */
export async function run(args) {
  if (!existsSync(STRYKER_CONFIG)) throw new Error(`${STRYKER_CONFIG} is missing: it gives the configuration of the mutation tests. Run \`npx caits init .\` to write it.`);
  // A run that stops before its report must not show the summary of the run before.
  rmSync(REPORT, { force: true });
  // Ctrl+C and `caits check` stop the whole group of processes: Stryker and its test runners stop with this command.
  const stryker = spawn("npx", ["stryker", "run", STRYKER_CONFIG, ...args], { stdio: "inherit" });
  /** @type {number} */
  const status = await new Promise(resolve => {
    stryker.on("error", () => resolve(1));
    stryker.on("close", code => resolve(code ?? 1));
  });
  if (!existsSync(REPORT)) return status;
  console.log("");
  return summary(["--survivors"]) || status;
}
