// `caits mutation-summary`: the mutation score of each file, from the report of Stryker. With --survivors, the mutants that survived.
// In a terminal: the score in green when every mutant is killed, else in red; the score of each file the same way, and its path in cyan;
// for each survivor, its line dim, its status in red, its mutator in yellow, and why a mutant is not judged, dim.
import { existsSync, readFileSync } from "node:fs";
import { painterOf } from "./terminal.mjs";

/** The report that Stryker writes in JSON (quality/caits/stryker.mjs). */
export const REPORT = "reports/mutation/mutation.json";

/** @typedef {{ status: string; statusReason?: string; mutatorName: string; replacement?: string; location: { start: { line: number } } }} Mutant */

/** @type {(file: string) => unknown} */
const readJson = file => JSON.parse(readFileSync(file, "utf8"));

/**
 * Stryker leaves out of the score a mutant whose tests ended in an error that is not a failed test: an error outside the tests, or a test
 * runner that stopped. Nothing tells whether a test sees the mutant: it is not judged. `caits mutation` kills a mutant whose test files
 * failed to load, and nothing else. @type {(m: Mutant) => boolean}
 */
const notJudged = m => m.status === "RuntimeError";

/** @type {(m: Mutant) => string} */
const tag = m => (m.status === "NoCoverage" ? "[no cov]" : m.status === "Survived" ? "[survived]" : "[not judged]");

/**
 * @param {string[]} args
 * @param {{ breakAt?: number | null }} [options] `breakAt`: the score under which the run fails, the threshold `break` of Stryker
 * @returns {number} 1 when a mutant is not judged, or when the score is under `breakAt`
 */
export function run(args, { breakAt = null } = {}) {
  if (!existsSync(REPORT)) throw new Error(`${REPORT} is missing: run the mutation tests first (npm run test:mutation).`);
  const report = /** @type {{ files: Record<string, { source: string; mutants: Mutant[] }> }} */ (readJson(REPORT));
  const rows = [];
  let killedTotal = 0, validTotal = 0, notJudgedTotal = 0;
  for (const [file, data] of Object.entries(report.files)) {
    /** @type {(status: string) => number} */
    const count = status => data.mutants.filter(m => m.status === status).length;
    const unjudged = data.mutants.filter(notJudged).length;
    const killed = count("Killed") + count("Timeout");
    const survived = count("Survived");
    const noCoverage = count("NoCoverage");
    const valid = killed + survived + noCoverage + unjudged;
    killedTotal += killed; validTotal += valid; notJudgedTotal += unjudged;
    rows.push({ file, killed, survived, noCoverage, unjudged, score: valid ? (100 * killed) / valid : 100, survivors: data.mutants.filter(m => m.status === "Survived" || m.status === "NoCoverage" || notJudged(m)), source: data.source.split("\n") });
  }
  rows.sort((a, b) => a.score - b.score);
  const verbose = args.includes("--survivors");
  const paint = painterOf(process.stdout);
  /** @type {(killed: number, valid: number) => "green" | "red"} */
  const colorOf = (killed, valid) => killed === valid ? "green" : "red";
  const score = validTotal ? (100 * killedTotal) / validTotal : 100;
  console.log(`${paint([colorOf(killedTotal, validTotal), "bold"], `Mutation score: ${score.toFixed(1)}%  (${killedTotal} killed of ${validTotal} valid mutants)`)}\n`);
  for (const row of rows) {
    const valid = row.killed + row.survived + row.noCoverage + row.unjudged;
    console.log(`${paint(colorOf(row.killed, valid), `${row.score.toFixed(0).padStart(4)}%`)}  ${paint("cyan", row.file)}  (killed ${row.killed}, survived ${row.survived}, no coverage ${row.noCoverage}${row.unjudged ? `, not judged ${row.unjudged}` : ""})`);
    if (verbose && row.survivors.length) {
      for (const m of row.survivors) {
        console.log(`        ${paint("dim", `L${m.location.start.line}`)} ${paint("red", tag(m))} ${paint("yellow", m.mutatorName)}: ${(row.source[m.location.start.line - 1] ?? "").trim().slice(0, 90)}  ${paint("dim", "→")}  ${String(m.replacement ?? "").slice(0, 60)}`);
        if (notJudged(m) && m.statusReason) console.log(`          ${paint("dim", m.statusReason.split("\n")[0].slice(0, 120))}`);
      }
    }
  }
  if (notJudgedTotal) {
    const one = notJudgedTotal === 1;
    console.log(`\n${paint("red", `${notJudgedTotal} ${one ? "mutant is" : "mutants are"} not judged: ${one ? "its" : "their"} tests ended in an error that is not a failed test, and Stryker leaves ${one ? "it" : "them"} out of the score. Run the mutation tests again; when ${one ? "it" : "one"} comes back, write a test that sees what it changes.`)}`);
  }
  return notJudgedTotal > 0 || (breakAt !== null && score < breakAt) ? 1 : 0;
}
