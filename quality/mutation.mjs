// `caits mutation`: the mutation tests (Stryker, with quality/stryker.config.mjs), then the score of each file and the mutants that
// survived, whether Stryker passed or not. Stryker alone ends with its threshold when the score is too low: the survivors say what to fix.
// Stryker stops the tests of a mutant that run too long, and counts the mutant as killed: the mutant may make the code loop without end.
// Its counter stops most of these loops, as it counts the runs of the code of the mutant, whatever the load of the machine. The clock
// stops the rest, but the load slows a mutant that survives, which runs the most tests, past its time: the mutants that the clock stopped
// run again, with more time and fewer tests at once, and their second result counts. A mutant whose test files failed to load is killed:
// its code throws as soon as a test imports it, every time, as a failed test does, where Stryker counts an error outside the tests. The
// run fails when a mutant is not judged (`caits mutation-summary`). Without code to mutate, as in a new project, Stryker does not run.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { REPORT, run as summary } from "./mutation-summary.mjs";
import { painterOf } from "./terminal.mjs";

/** The configuration of Stryker in a project: it imports the defaults of CAITS (quality/caits/stryker.mjs). */
export const STRYKER_CONFIG = "quality/stryker.config.mjs";

/** The page of the report, which Stryker writes with the report in a line of its script (quality/caits/stryker.mjs). */
const PAGE = "reports/mutation/index.html";

/** The line of the page that holds the report. */
const PAGE_REPORT = /^( *app\.report = ).*;$/m;

/** The second run of the mutants that the clock stopped: more time for each, fewer at once, and the report in JSON only. */
const SECOND_RUN = ["--concurrency", "4", "--timeoutFactor", "3", "--reporters", "json"];

/** How Stryker starts the reason of an error outside the tests: then come the test files that failed to load, then the other errors. */
const OUTSIDE = "An error occurred outside of a test run: ";

/** A test file that failed to load, as Stryker gives it on a line of its own: `<its path>: <the message>`. */
const LOAD_FAILURE = /^\/.*\.(?:test|spec)\.[cm]?[jt]sx?: /;

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
  const { mutate, thresholds } = await optionsOf(config);
  // Without a pattern of code, Stryker warns that it found no file to mutate, then runs the tests without changing anything.
  if (Array.isArray(mutate) && mutate.length === 0) {
    console.log(`No file matches mutate in ${config}: the mutation tests have no code to change yet.`);
    return 0;
  }
  removeOrphans();
  // The tests write their temporary files in a folder of this run: a test that Stryker stops cannot remove them. In WSL, the temporary
  // folder of the system is in memory.
  const temporary = mkdtempSync(join(tmpdir(), `caits-mutation-${process.pid}-`));
  try {
    const status = await stryker([config, ...args], temporary);
    if (!existsSync(REPORT)) return status;
    const first = readReport();
    let report = first;
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
      report = withSecondResults(first, readReport());
    }
    report = withLoadFailuresKilled(report);
    writeFileSync(REPORT, JSON.stringify(report));
    // The page shows the report too: Stryker breaks each < apart, so that no text of the report ends the script.
    if (existsSync(PAGE)) writeFileSync(PAGE, readFileSync(PAGE, "utf8").replace(PAGE_REPORT, (_, start) => `${start}${JSON.stringify(report).replaceAll("<", '<"+"')};`));
    console.log("");
    return summary(["--survivors"], { breakAt: thresholds?.break ?? null }) || status;
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
 * The test files of the mutant failed to load, and nothing else: each line of its reason is a test file that failed to load. An error
 * after the tests, or a message on more than one line, has a line that is not one, and the mutant stays not judged.
 * @type {(mutant: Mutant) => boolean}
 */
const failedToLoad = ({ status, statusReason }) => status === "RuntimeError" && typeof statusReason === "string" && statusReason.startsWith(OUTSIDE)
  && statusReason.slice(OUTSIDE.length).split("\n").every(line => LOAD_FAILURE.test(line));

/**
 * The report, where a mutant whose test files failed to load is killed.
 * @param {Report} report
 * @returns {Report}
 */
function withLoadFailuresKilled(report) {
  const files = Object.fromEntries(Object.entries(report.files).map(([file, data]) => [file, {
    ...data,
    mutants: data.mutants.map(mutant => failedToLoad(mutant) ? { ...mutant, status: "Killed", statusReason: `The test files that import its code failed to load. ${mutant.statusReason}` } : mutant)
  }]));
  return { ...report, files };
}

/**
 * The options of the configuration that this command reads: the patterns of the code to mutate, and the threshold `break`, the score
 * under which Stryker fails, none by default.
 * @param {string} config
 * @returns {Promise<{ mutate?: unknown; thresholds?: { break?: number | null } }>}
 */
async function optionsOf(config) {
  const module = config.endsWith(".json") ? { default: readJson(config) } : /** @type {{ default: unknown }} */ (await import(pathToFileURL(resolve(config)).href));
  return /** @type {{ mutate?: unknown; thresholds?: { break?: number | null } }} */ (module.default);
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
