import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { NOT_RUN } from "./mutation-suite.mjs";

const CAITS = join(import.meta.dirname, "..");

const PASSES = "import { expect, test } from \"vitest\";\ntest(\"passes\", () => expect(1).toBe(1));\n";
const FAILS = "import { expect, test } from \"vitest\";\ntest(\"fails\", () => expect(1).toBe(2));\n";
const CONFIG = "export default { test: { include: [\"test/**/*.test.ts\"] } };\n";
/** A configuration that stops Vitest before the tests, as an error of Vite does. */
const BREAKS = "export default { plugins: [{ name: \"breaks\", buildStart() { throw new Error(\"Vite breaks\"); } }], test: { include: [\"test/**/*.test.ts\"] } };\n";

/** @type {string[]} */
const folders = [];
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });

/**
 * A sandbox of Stryker, with the packages of CAITS. Its node_modules/ is a folder of its own, so that a test sees what the suite writes in it.
 * @param {Record<string, string>} files
 */
function newSandbox(files) {
  const sandbox = mkdtempSync(join(tmpdir(), "caits-sandbox-"));
  folders.push(sandbox);
  for (const [file, text] of Object.entries({ "package.json": "{ \"type\": \"module\" }\n", ...files })) {
    mkdirSync(dirname(join(sandbox, file)), { recursive: true });
    writeFileSync(join(sandbox, file), text);
  }
  mkdirSync(join(sandbox, "node_modules"));
  for (const entry of readdirSync(join(CAITS, "node_modules"))) {
    if (!entry.startsWith(".") || entry === ".bin") symlinkSync(join(CAITS, "node_modules", entry), join(sandbox, "node_modules", entry));
  }
  return sandbox;
}

/**
 * `caits mutation-suite`, as Stryker runs it, in a sandbox. The suite runs its own Vitest: it does not take the variables of this one.
 * @param {string} sandbox
 * @param {Record<string, string>} [variables]
 * @returns {Promise<{ status: number | null; output: string }>}
 */
function runSuite(sandbox, variables = {}) {
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("VITEST") && name !== "NODE_ENV")), ...variables };
  const suite = spawn(process.execPath, [join(CAITS, "bin/caits.js"), "mutation-suite", "--bail=1", "--no-isolate", "--maxWorkers=1"], { cwd: sandbox, env });
  let output = "";
  suite.stdout.on("data", chunk => { output += chunk; });
  suite.stderr.on("data", chunk => { output += chunk; });
  return new Promise(resolve => suite.on("close", status => resolve({ status, output })));
}

describe("caits mutation-suite", () => {
  test("passes when the tests pass, and writes nothing in the node_modules/ of the sandbox, which the other suites share", async () => {
    const sandbox = newSandbox({ "quality/vite.config.ts": CONFIG, "test/a.test.ts": PASSES });
    const packages = readdirSync(join(sandbox, "node_modules"));

    const { status, output } = await runSuite(sandbox);

    expect(status, output).toBe(0);
    expect(readdirSync(join(sandbox, "node_modules"))).toEqual(packages);
  }, 60_000);

  test("fails when a test fails: the mutant is killed", async () => {
    const { status, output } = await runSuite(newSandbox({ "quality/vite.config.ts": CONFIG, "test/a.test.ts": FAILS }));

    expect(status).toBe(1);
    expect(output).toContain("fails");
    expect(output).not.toContain(NOT_RUN);
  }, 60_000);

  test("says that the mutant is not tested when Vitest stops before the tests", async () => {
    const { status, output } = await runSuite(newSandbox({ "quality/vite.config.ts": BREAKS, "test/a.test.ts": PASSES }));

    expect(status).not.toBe(0);
    expect(output).toContain("Vite breaks");
    expect(output).toContain(`${NOT_RUN}: Vitest stopped before them`);
  }, 60_000);

  test("removes the copies of the suites that Stryker stopped with SIGKILL, and only theirs", async () => {
    const temporary = mkdtempSync(join(tmpdir(), "caits-tmp-"));
    folders.push(temporary);
    const stopped = spawnSync(process.execPath, ["-e", ""]).pid;
    for (const copy of [`caits-mutation-${stopped}-old`, `caits-mutation-${process.pid}-running`, "other"]) mkdirSync(join(temporary, copy));

    const { status, output } = await runSuite(newSandbox({ "quality/vite.config.ts": CONFIG, "test/a.test.ts": PASSES }), { TMPDIR: temporary });

    expect(status, output).toBe(0);
    const left = readdirSync(temporary);
    expect(left.filter(entry => entry.startsWith("caits-mutation-"))).toEqual([`caits-mutation-${process.pid}-running`]);
    expect(left).toContain("other");
  }, 60_000);
});
