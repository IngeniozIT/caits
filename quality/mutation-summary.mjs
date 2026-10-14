// `caits mutation-summary`: the mutation score of each file, from the report of Stryker. With --survivors, the mutants that survived.
import { existsSync, readFileSync } from "node:fs";
import { NOT_RUN } from "./mutation-suite.mjs";

/** The report that Stryker writes in JSON (quality/caits/stryker.mjs). */
export const REPORT = "reports/mutation/mutation.json";

/** @typedef {{ status: string; statusReason?: string; mutatorName: string; replacement?: string; location: { start: { line: number } } }} Mutant */

/** @type {(file: string) => unknown} */
const readJson = file => JSON.parse(readFileSync(file, "utf8"));

/** Stryker counts a suite that stopped before its tests as a kill: the mutant is not tested (`caits mutation-suite`). @type {(m: Mutant) => boolean} */
const notTested = m => m.status === "Killed" && Boolean(m.statusReason?.includes(NOT_RUN));

/** @type {(m: Mutant) => string} */
const tag = m => (m.status === "NoCoverage" ? "[no cov]" : m.status === "Survived" ? "[survived]" : "[not tested]");

/**
 * @param {string[]} args
 * @returns {number} 1 when a mutant is not tested
 */
export function run(args) {
  if (!existsSync(REPORT)) throw new Error(`${REPORT} is missing: run the mutation tests first (npm run test:mutation).`);
  const report = /** @type {{ files: Record<string, { source: string; mutants: Mutant[] }> }} */ (readJson(REPORT));
  const rows = [];
  let killedTotal = 0, validTotal = 0, notTestedTotal = 0;
  for (const [file, data] of Object.entries(report.files)) {
    /** @type {(status: string) => number} */
    const count = status => data.mutants.filter(m => m.status === status).length;
    const untested = data.mutants.filter(notTested).length;
    const killed = count("Killed") - untested + count("Timeout");
    const survived = count("Survived");
    const noCoverage = count("NoCoverage");
    const valid = killed + survived + noCoverage + untested;
    killedTotal += killed; validTotal += valid; notTestedTotal += untested;
    rows.push({ file, killed, survived, noCoverage, untested, score: valid ? (100 * killed) / valid : 100, survivors: data.mutants.filter(m => m.status === "Survived" || m.status === "NoCoverage" || notTested(m)), source: data.source.split("\n") });
  }
  rows.sort((a, b) => a.score - b.score);
  const verbose = args.includes("--survivors");
  console.log(`Mutation score: ${(validTotal ? (100 * killedTotal) / validTotal : 100).toFixed(1)}%  (${killedTotal} killed of ${validTotal} valid mutants)\n`);
  for (const row of rows) {
    console.log(`${row.score.toFixed(0).padStart(4)}%  ${row.file}  (killed ${row.killed}, survived ${row.survived}, no coverage ${row.noCoverage}${row.untested ? `, not tested ${row.untested}` : ""})`);
    if (verbose && row.survivors.length) {
      for (const m of row.survivors) console.log(`        L${m.location.start.line} ${tag(m)} ${m.mutatorName}: ${(row.source[m.location.start.line - 1] ?? "").trim().slice(0, 90)}  →  ${String(m.replacement ?? "").slice(0, 60)}`);
    }
  }
  if (!notTestedTotal) return 0;
  console.log(`\n${notTestedTotal} ${notTestedTotal === 1 ? "mutant is" : "mutants are"} not tested: the unit tests did not run, and Stryker counts ${notTestedTotal === 1 ? "it" : "them"} as killed. Run the mutation tests again. Why they did not run: reports/mutation/index.html.`);
  return 1;
}
