// `caits mutation`: the mutation tests (Stryker, with quality/stryker.config.mjs), then the score of each file and the mutants that
// survived, whether Stryker passed or not. Stryker alone ends with its threshold when the score is too low: the survivors say what to fix.
// Stryker stops the tests of a mutant that run too long, and counts the mutant as killed: the mutant may make the code loop without end.
// Its counter stops most of these loops, as it counts the runs of the code of the mutant, whatever the load of the machine. The clock
// stops the rest, but the load slows a mutant that survives, which runs the most tests, past its time: the mutants that the clock stopped
// run again, with more time and fewer tests at once, and their second result counts. The run fails when a mutant is not judged
// (`caits mutation-summary`).
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { REPORT, run as summary } from "./mutation-summary.mjs";
import { painterOf } from "./terminal.mjs";

/** The configuration of Stryker in a project: it imports the defaults of CAITS (quality/caits/stryker.mjs). */
export const STRYKER_CONFIG = "quality/stryker.config.mjs";

/** The second run of the mutants that the clock stopped: more time for each, fewer at once, and the report in JSON only. */
const SECOND_RUN = ["--concurrency", "4", "--timeoutFactor", "3", "--reporters", "json"];

/** The temporary folders of the runs, in the temporary folder of the system: `caits-mutation-<pid of their run>-<random>`. */
const TEMPORARY = /^caits-mutation-(\d+)-/;

/** @typedef {{ status: string; statusReason?: string; mutatorName: string; replacement?: string; location: { start: { line: number; column: number }; end: { line: number; column: number } } }} Mutant */
/** @typedef {{ files: Record<string, { mutants: Mutant[] }> }} Report */

/**
 * @param {string[]} args the options of Stryker
 * @param {string} [config] the configuration of Stryker: a module, or JSON
 * @returns {Promise<number>} the exit code of Stryker, or 1 when a mutant is not judged, or when the score is under the threshold after
 * the second run
 */
export async function run(args, config = STRYKER_CONFIG) {
  if (!existsSync(config)) throw new Error(`${config} is missing: it gives the configuration of the mutation tests. Run \`npx caits init .\` to write it.`);
  // A run that stops before its report must not show the summary of the run before.
  rmSync(REPORT, { force: true });
  removeOrphans();
  // The tests write their temporary files in a folder of this run: a test that Stryker stops cannot remove them. In WSL, the temporary
  // folder of the system is in memory.
  const temporary = mkdtempSync(join(tmpdir(), `caits-mutation-${process.pid}-`));
  try {
    const status = await stryker([config, ...args], temporary);
    if (!existsSync(REPORT)) return status;
    const first = readReport();
    const late = Object.entries(first.files).flatMap(([file, { mutants }]) => mutants.filter(stoppedByTheClock).map(mutant => ({ file, mutant })));
    if (late.length > 0) {
      const one = late.length === 1;
      console.log(`\n${late.length} ${one ? "mutant" : "mutants"} ran out of time on the clock, which the load of the machine slows: ${one ? "it runs" : "they run"} again, with more time and fewer tests at once.\n`);
      rmSync(REPORT);
      const ranges = [...new Set(late.map(({ file, mutant }) => `${file}:${mutant.location.start.line}-${mutant.location.end.line}`))];
      await stryker([config, ...args, "--mutate", ranges.join(","), ...SECOND_RUN], temporary);
      if (!existsSync(REPORT)) {
        writeFileSync(REPORT, JSON.stringify(first));
        console.log("");
        summary(["--survivors"]);
        console.log(`\n${painterOf(process.stdout)("red", "The second run stopped before its report: the mutants that the clock stopped count as killed, as Stryker counts them. Run the mutation tests again.")}`);
        return 1;
      }
      writeFileSync(REPORT, JSON.stringify(withSecondResults(first, readReport())));
    }
    console.log("");
    return summary(["--survivors"], { breakAt: await breakOf(config) }) || status;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

/**
 * Runs Stryker. Ctrl+C and `caits check` stop the whole group of processes: Stryker and its test runners stop with this command.
 * @param {string[]} args
 * @param {string} temporary the temporary folder of the tests
 * @returns {Promise<number>}
 */
function stryker(args, temporary) {
  const running = spawn("npx", ["stryker", "run", ...args], { stdio: "inherit", env: { ...process.env, TMPDIR: temporary } });
  return new Promise(resolve => {
    running.on("error", () => resolve(1));
    running.on("close", code => resolve(code ?? 1));
  });
}

/** @type {(file: string) => unknown} */
const readJson = file => JSON.parse(readFileSync(file, "utf8"));

/** @returns {Report} */
const readReport = () => /** @type {Report} */ (readJson(REPORT));

/** The clock stopped the mutant: Stryker gives a reason only when its counter stops it. @type {(mutant: Mutant) => boolean} */
const stoppedByTheClock = mutant => mutant.status === "Timeout" && !mutant.statusReason?.startsWith("Hit limit reached");

/** @type {(file: string, mutant: Mutant) => string} */
const keyOf = (file, { mutatorName, replacement, location: { start, end } }) => [file, start.line, start.column, end.line, end.column, mutatorName, replacement].join(" ");

/**
 * The first report, with the results of the second run for the mutants that the clock stopped. The second run tests the whole lines of
 * these mutants: its other mutants keep their first result.
 * @param {Report} first
 * @param {Report} second
 * @returns {Report}
 */
function withSecondResults(first, second) {
  const again = new Map(Object.entries(second.files).flatMap(([file, { mutants }]) => mutants.map(mutant => [keyOf(file, mutant), mutant])));
  const files = Object.fromEntries(Object.entries(first.files).map(([file, data]) => [file, {
    ...data,
    mutants: data.mutants.map(mutant => {
      const result = stoppedByTheClock(mutant) ? again.get(keyOf(file, mutant)) : undefined;
      return result === undefined ? mutant : { ...mutant, status: result.status, statusReason: result.statusReason };
    })
  }]));
  return { ...first, files };
}

/**
 * The threshold `break` of the configuration: the score under which Stryker fails, none by default.
 * @param {string} config
 * @returns {Promise<number | null>}
 */
async function breakOf(config) {
  const module = config.endsWith(".json") ? { default: readJson(config) } : /** @type {{ default: unknown }} */ (await import(pathToFileURL(resolve(config)).href));
  return /** @type {{ thresholds?: { break?: number | null } }} */ (module.default).thresholds?.break ?? null;
}

/** Removes the temporary folders whose run no longer runs: Ctrl+C and `caits check` stop a run before its end. */
function removeOrphans() {
  for (const entry of readdirSync(tmpdir())) {
    const pid = TEMPORARY.exec(entry)?.[1];
    if (pid === undefined || runs(Number(pid))) continue;
    try {
      rmSync(join(tmpdir(), entry), { recursive: true, force: true });
    } catch {
      // The folder of another user.
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
