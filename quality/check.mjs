// `caits check <script>…`: runs the npm scripts of the checks at once, then tells which pass and which fail. It shows the output of the
// checks that fail, and only theirs: a check that passes takes one line, for the developer and for an AI agent, who reads less.
// The builds of Marko and the starts of Vitest write their files in the build folder: the checks that run at once would empty the
// folder of each other. Each check gets a folder of its own in CAITS_OUT_DIR, which quality/caits/vite.ts reads. The end-to-end tests
// build in dist/ all the same: `npm start` runs dist/index.mjs.
// In a terminal, the report has colors, and so has the output of a check that fails: the checks run with FORCE_COLOR. In a pipe (an AI
// agent, a log), the report and the checks have none: they run with NO_COLOR.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { constants } from "node:os";
import { join } from "node:path";
import { colors, painterOf } from "./terminal.mjs";

export const OUT_DIRS = "node_modules/.caits/check";

/** @type {(file: string) => unknown} */
const readJson = file => JSON.parse(readFileSync(file, "utf8"));

/** @param {number} milliseconds */
const durationOf = milliseconds => {
  const seconds = Math.round(milliseconds / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, "0")}s`;
};

/** @param {string[]} args the npm scripts of the checks */
export async function run(args) {
  return check(process.cwd(), args);
}

/**
 * Runs each npm script of `scripts` in the project of `root`, all at once, each in a group of processes of its own: the end of the
 * command, or Ctrl+C, stops the servers and the workers that a check starts. `print` gets each line of the report, and `paint` colors
 * its parts. Gives the exit code: 0 when all the checks pass.
 * @param {string} root
 * @param {string[]} scripts
 * @param {(line: string) => void} [print]
 * @param {import("./terminal.mjs").Paint} [paint]
 * @returns {Promise<number>}
 */
export async function check(root, scripts, print = line => console.log(line), paint = painterOf(process.stdout)) {
  if (scripts.length === 0) {
    print(paint("red", "Give the npm scripts of the checks: caits check typecheck lint test"));
    return 1;
  }
  // npm says nothing of a missing script when it runs silent: the command names them, and runs nothing.
  const manifest = join(root, "package.json");
  const known = existsSync(manifest) ? /** @type {{ scripts?: Record<string, string> }} */ (readJson(manifest)).scripts ?? {} : {};
  const missing = scripts.filter(script => !Object.hasOwn(known, script));
  if (missing.length > 0) {
    print(paint("red", `package.json has no script ${missing.join(", ")}.`));
    return 1;
  }
  const width = Math.max(...scripts.map(script => script.length));
  const started = Date.now();
  print(paint("dim", `${scripts.length} checks at once: ${scripts.join(", ")}`));

  const steps = scripts.map(script => start(root, script, colors(paint)));
  const stop = () => { for (const step of steps) step.stop(); };
  /** @param {NodeJS.Signals} signal Ctrl+C (SIGINT) exits with 130, SIGTERM with 143, as a shell tells a command that a signal stops. */
  const interrupt = signal => { stop(); process.exit(128 + constants.signals[signal]); };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    const results = await Promise.all(steps.map(async step => {
      const result = await step.done;
      print(`${result.passed ? paint("green", "✓") : paint("red", "✗")} ${step.script.padEnd(width)}  ${paint("dim", durationOf(result.duration))}`);
      return { script: step.script, ...result };
    }));
    const failed = results.filter(result => !result.passed);
    for (const { script, output } of failed) print(`\n${paint("bold", `── ${script} ──`)}\n${output.trimEnd()}`);
    const total = durationOf(Date.now() - started);
    print(failed.length === 0
      ? `\n${paint(["green", "bold"], `All ${results.length} checks passed in ${total}.`)}`
      : `\n${paint(["red", "bold"], `${failed.length} of ${results.length} checks failed: ${failed.map(({ script }) => script).join(", ")}.`)}`);
    return failed.length === 0 ? 0 : 1;
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
    stop();
  }
}

/**
 * Starts `npm run <script>`, with its build folder, and keeps its output: with the colors of its tool when the report has colors.
 * @param {string} root
 * @param {string} script
 * @param {boolean} colored
 */
function start(root, script, colored) {
  const began = Date.now();
  const { FORCE_COLOR: _force, NO_COLOR: _no, ...rest } = process.env;
  const env = { ...rest, ...(colored ? { FORCE_COLOR: "1" } : { NO_COLOR: "1" }), CAITS_OUT_DIR: join(OUT_DIRS, script.replaceAll(":", "-")) };
  const child = spawn("npm", ["run", "--silent", script], { cwd: root, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { output += chunk; });
  /** @type {Promise<{ passed: boolean; duration: number; output: string }>} */
  const done = new Promise(resolve => {
    child.on("error", error => resolve({ passed: false, duration: Date.now() - began, output: `${output}${error.message}\n` }));
    child.on("close", code => resolve({ passed: code === 0, duration: Date.now() - began, output }));
  });
  const stop = () => {
    try {
      if (child.pid) process.kill(-child.pid);
    } catch {
      // The group stopped already.
    }
  };
  return { script, done, stop };
}
