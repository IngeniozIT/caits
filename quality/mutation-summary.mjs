// `caits mutation-summary`: the mutation score of each file, from the report of Stryker. With --survivors, the mutants that survived.
import { readFileSync } from "node:fs";

export async function run(args) {
  const report = JSON.parse(readFileSync("reports/mutation/mutation.json", "utf8"));
  const rows = [];
  let killedTotal = 0, validTotal = 0;
  for (const [file, data] of Object.entries(report.files)) {
    const count = status => data.mutants.filter(m => m.status === status).length;
    const killed = count("Killed") + count("Timeout");
    const survived = count("Survived");
    const noCoverage = count("NoCoverage");
    const valid = killed + survived + noCoverage;
    killedTotal += killed; validTotal += valid;
    rows.push({ file, killed, survived, noCoverage, score: valid ? (100 * killed) / valid : 100, survivors: data.mutants.filter(m => m.status === "Survived" || m.status === "NoCoverage"), source: data.source.split("\n") });
  }
  rows.sort((a, b) => a.score - b.score);
  const verbose = args.includes("--survivors");
  console.log(`Mutation score: ${(validTotal ? (100 * killedTotal) / validTotal : 100).toFixed(1)}%  (${killedTotal} killed of ${validTotal} valid mutants)\n`);
  for (const row of rows) {
    console.log(`${row.score.toFixed(0).padStart(4)}%  ${row.file}  (killed ${row.killed}, survived ${row.survived}, no coverage ${row.noCoverage})`);
    if (verbose && row.survivors.length) {
      for (const m of row.survivors) console.log(`        L${m.location.start.line} ${m.status === "NoCoverage" ? "[no cov]" : "[survived]"} ${m.mutatorName}: ${(row.source[m.location.start.line - 1] ?? "").trim().slice(0, 90)}  →  ${String(m.replacement ?? "").slice(0, 60)}`);
    }
  }
  return 0;
}
