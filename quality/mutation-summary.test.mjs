import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { NOT_RUN } from "./mutation-suite.mjs";
import { REPORT } from "./mutation-summary.mjs";

const SOURCE = "export function isLong(text: string) {\n  return text.length > 10;\n}\n";

/** @type {string[]} */
const folders = [];
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });

/**
 * `caits mutation-summary --survivors`, on a report of Stryker with the mutants of one file, all on its line 2: in a pipe, or with the
 * colors of a terminal.
 * @param {{ status: string; statusReason?: string }[]} mutants
 * @param {boolean} [colored]
 */
function summary(mutants, colored = false) {
  const root = mkdtempSync(join(tmpdir(), "caits-mutation-summary-"));
  folders.push(root);
  mkdirSync(join(root, "reports/mutation"), { recursive: true });
  const report = { files: { "src/long.ts": { source: SOURCE, mutants: mutants.map((m, i) => ({ id: String(i), mutatorName: "EqualityOperator", replacement: "text.length >= 10", location: { start: { line: 2, column: 9 }, end: { line: 2, column: 25 } }, ...m })) } } };
  writeFileSync(join(root, REPORT), JSON.stringify(report));
  const { FORCE_COLOR: _force, NO_COLOR: _no, ...env } = process.env;
  const { status, stdout } = spawnSync(process.execPath, [join(import.meta.dirname, "../bin/caits.js"), "mutation-summary", "--survivors"], { cwd: root, env: { ...env, ...(colored ? { FORCE_COLOR: "1" } : { NO_COLOR: "1" }) }, encoding: "utf8" });
  return { status, output: stdout };
}

describe("caits mutation-summary", () => {
  test("gives the score of each file, and the mutants that survived", () => {
    const { status, output } = summary([{ status: "Killed", statusReason: "AssertionError: expected true to be false" }, { status: "Timeout" }, { status: "Survived" }]);

    expect(status).toBe(0);
    expect(output).toContain("Mutation score: 66.7%  (2 killed of 3 valid mutants)");
    expect(output).toContain("  67%  src/long.ts  (killed 2, survived 1, no coverage 0)\n");
    expect(output).toContain("L2 [survived] EqualityOperator: return text.length > 10;  →  text.length >= 10");
  });

  test("does not count as killed a mutant whose tests did not run, and fails", () => {
    const { status, output } = summary([{ status: "Killed", statusReason: "AssertionError: expected true to be false" }, { status: "Killed", statusReason: `Startup Error\n${NOT_RUN}: Vitest stopped before them (exit 1).` }]);

    expect(status).toBe(1);
    expect(output).toContain("Mutation score: 50.0%  (1 killed of 2 valid mutants)");
    expect(output).toContain("  50%  src/long.ts  (killed 1, survived 0, no coverage 0, not tested 1)");
    expect(output).toContain("L2 [not tested] EqualityOperator");
    expect(output).toContain("1 mutant is not tested: the unit tests did not run, and Stryker counts it as killed. Run the mutation tests again.");
  });

  describe("in a terminal", () => {
    const red = (/** @type {string} */ text) => `\u001b[31m${text}\u001b[39m`;
    const green = (/** @type {string} */ text) => `\u001b[32m${text}\u001b[39m`;
    const bold = (/** @type {string} */ text) => `\u001b[1m${text}\u001b[22m`;
    const cyan = (/** @type {string} */ text) => `\u001b[36m${text}\u001b[39m`;
    const dim = (/** @type {string} */ text) => `\u001b[2m${text}\u001b[22m`;
    const yellow = (/** @type {string} */ text) => `\u001b[33m${text}\u001b[39m`;

    test("colors the score in red when a mutant survived, the path in cyan, and each part of a survivor", () => {
      const { output } = summary([{ status: "Killed", statusReason: "AssertionError" }, { status: "Survived" }], true);

      expect(output).toContain(`${red(bold("Mutation score: 50.0%  (1 killed of 2 valid mutants)"))}\n`);
      expect(output).toContain(`${red("  50%")}  ${cyan("src/long.ts")}  (killed 1, survived 1, no coverage 0)\n`);
      expect(output).toContain(`        ${dim("L2")} ${red("[survived]")} ${yellow("EqualityOperator")}: return text.length > 10;  ${dim("→")}  text.length >= 10\n`);
    });

    test("colors the score in green when every mutant is killed", () => {
      const { output } = summary([{ status: "Killed", statusReason: "AssertionError" }], true);

      expect(output).toContain(`${green(bold("Mutation score: 100.0%  (1 killed of 1 valid mutants)"))}\n`);
      expect(output).toContain(`${green(" 100%")}  ${cyan("src/long.ts")}`);
    });

    test("colors in red the mutants that are not tested", () => {
      const { output } = summary([{ status: "Killed", statusReason: `${NOT_RUN}: Vitest stopped before them (exit 1).` }], true);

      expect(output).toContain(red("1 mutant is not tested: the unit tests did not run, and Stryker counts it as killed. Run the mutation tests again. Why they did not run: reports/mutation/index.html."));
    });
  });
});
