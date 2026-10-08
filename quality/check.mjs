// `caits check <script>…`: runs the npm scripts of the checks at once, then tells which pass and which fail. It shows the output of the
// checks that fail, and only theirs: a check that passes takes one line, for the developer and for an AI agent, who reads less.
// The builds of Marko and the starts of Vitest write their files in the build folder: the checks that run at once would empty the
// folder of each other. Each check gets a folder of its own in CAITS_OUT_DIR, which quality/caits/vite.ts reads. The end-to-end tests
// build in dist/ all the same: `npm start` runs dist/index.mjs.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const OUT_DIRS = "node_modules/.caits/check";

/** @param {number} milliseconds */
const durationOf = milliseconds => {
  const seconds = Math.round(milliseconds / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, "0")}s`;
};

export async function run(args) {
  return check(process.cwd(), args);
}

/**
 * Runs each npm script of `scripts` in the project of `root`, all at once, each in a group of processes of its own: the end of the
 * command, or Ctrl+C, stops the servers and the workers that a check starts. `print` gets each line of the report. Gives the exit code:
 * 0 when all the checks pass.
 * @param {string} root
 * @param {string[]} scripts
 * @param {(line: string) => void} [print]
 * @returns {Promise<number>}
 */
export async function check(root, scripts, print = line => console.log(line)) {
  if (scripts.length === 0) {
    print("Give the npm scripts of the checks: caits check typecheck lint test");
    return 1;
  }
  // npm says nothing of a missing script when it runs silent: the command names them, and runs nothing.
  const manifest = join(root, "package.json");
  const known = existsSync(manifest) ? JSON.parse(readFileSync(manifest, "utf8")).scripts ?? {} : {};
  const missing = scripts.filter(script => !Object.hasOwn(known, script));
  if (missing.length > 0) {
    print(`package.json has no script ${missing.join(", ")}.`);
    return 1;
  }
  const width = Math.max(...scripts.map(script => script.length));
  const started = Date.now();
  print(`${scripts.length} checks at once: ${scripts.join(", ")}`);

  const steps = scripts.map(script => start(root, script));
  const stop = () => { for (const step of steps) step.stop(); };
  const interrupt = () => { stop(); process.exit(130); };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    const results = await Promise.all(steps.map(async step => {
      const result = await step.done;
      print(`${result.passed ? "✓" : "✗"} ${step.script.padEnd(width)}  ${durationOf(result.duration)}`);
      return { script: step.script, ...result };
    }));
    const failed = results.filter(result => !result.passed);
    for (const { script, output } of failed) print(`\n── ${script} ──\n${output.trimEnd()}`);
    const total = durationOf(Date.now() - started);
    print(failed.length === 0
      ? `\nAll ${results.length} checks passed in ${total}.`
      : `\n${failed.length} of ${results.length} checks failed: ${failed.map(({ script }) => script).join(", ")}.`);
    return failed.length === 0 ? 0 : 1;
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
    stop();
  }
}

/**
 * Starts `npm run <script>`, with its build folder, and keeps its output.
 * @param {string} root
 * @param {string} script
 */
function start(root, script) {
  const began = Date.now();
  const env = { ...process.env, CAITS_OUT_DIR: join(OUT_DIRS, script.replaceAll(":", "-")) };
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
