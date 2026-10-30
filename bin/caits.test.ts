import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { SUGGESTED, VERSION } from "./init.js";

const CAITS = join(import.meta.dirname, "caits.js");

const folders: string[] = [];
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });

function newFolder(): string {
  const folder = mkdtempSync(join(tmpdir(), "caits-command-"));
  folders.push(folder);
  return folder;
}

/** Runs the command of CAITS in a folder, without colors or with those of a terminal: its exit code, and what it prints. */
function run(colored: boolean, cwd: string, args: string[]) {
  const { FORCE_COLOR: _force, NO_COLOR: _no, ...env } = process.env;
  const { status, stdout, stderr } = spawnSync(process.execPath, [CAITS, ...args], { cwd, env: { ...env, ...(colored ? { FORCE_COLOR: "1" } : { NO_COLOR: "1" }) }, encoding: "utf8" });
  return { status, stdout, stderr };
}

/** Runs the command of CAITS in a folder, as in a pipe: without colors. */
const caits = (cwd: string, ...args: string[]) => run(false, cwd, args);

/** Runs the command of CAITS in a folder, as in a terminal: with colors. */
const caitsInColor = (cwd: string, ...args: string[]) => run(true, cwd, args);

const red = (text: string) => `\u001b[31m${text}\u001b[39m`;
const green = (text: string) => `\u001b[32m${text}\u001b[39m`;
const yellow = (text: string) => `\u001b[33m${text}\u001b[39m`;
const cyan = (text: string) => `\u001b[36m${text}\u001b[39m`;
const bold = (text: string) => `\u001b[1m${text}\u001b[22m`;
const dim = (text: string) => `\u001b[2m${text}\u001b[22m`;

describe("the command caits", () => {
  test("--version gives the version of CAITS", () => {
    expect(caits(newFolder(), "--version")).toEqual({ status: 0, stdout: `${VERSION}\n`, stderr: "" });
  });

  test.for(["--help", "-h", "init --help", "init my-app -h", "update --help", "e2e --help", "check --help"])("`caits %s` gives the usage, and does nothing else", args => {
    const folder = newFolder();

    const { status, stdout, stderr } = caits(folder, ...args.split(" "));

    expect(status).toBe(0);
    expect(stdout).toMatch(/^Usage: caits <command>\n/);
    expect(stderr).toBe("");
    expect(readdirSync(folder)).toEqual([]);
  });

  test("without a command, gives the usage, and fails", () => {
    const { status, stderr } = caits(newFolder());

    expect(status).toBe(1);
    expect(stderr).toMatch(/^Usage: caits <command>\n/);
  });

  test.for([
    ["an unknown command", ["deploy"], "Unknown command: deploy."],
    ["an unknown option", ["--verbose"], "Unknown option: --verbose."],
    ["an unknown option of init", ["init", "my-app", "--exmaple"], "Unknown option: --exmaple."],
    ["an option of init without its value", ["init", "my-app", "--caits"], "The option --caits needs a value: --caits <value>."],
    ["an option of init with another option for its value", ["init", "my-app", "--example-source", "--no-install"], "The option --example-source needs a value: --example-source <value>."],
    ["an option of init that takes no value", ["init", "my-app", "--example=yes"], "The option --example takes no value."],
    ["two folders for init", ["init", "my-app", "other"], "init takes one folder, not 2: my-app other."],
    ["an argument of update", ["update", "now"], "update takes no argument: now."]
  ] as const)("refuses %s, says why, and tells where to read the usage", ([, args, message]) => {
    const folder = newFolder();

    const { status, stdout, stderr } = caits(folder, ...args);

    expect(status).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toBe(`${message}\nRun \`caits --help\`.\n`);
    expect(readdirSync(folder)).toEqual([]);
  });

  test("init: the next steps quote a folder whose name has a space", () => {
    const folder = newFolder();

    const { status, stdout } = caits(folder, "init", "My App", "--no-install");

    expect(status).toBe(0);
    expect(stdout).toContain("\nNext:\n  cd 'My App'\n  npm install\n");
  });

  test("init: a package.json that is not JSON is named, and nothing is written", () => {
    const folder = newFolder();
    writeFileSync(join(folder, "package.json"), "{ not json");

    const { status, stderr } = caits(folder, "init", ".", "--no-install");

    expect(status).toBe(1);
    expect(stderr).toMatch(new RegExp(`^${join(folder, "package.json")} is not valid JSON: `));
    expect(readdirSync(folder)).toEqual(["package.json"]);
  });

  test("architecture: without the file of the rules, says how to get it", () => {
    const { status, stderr } = caits(newFolder(), "architecture");

    expect(status).toBe(1);
    expect(stderr).toContain("quality/architecture.mjs is missing: it gives the rules that `caits architecture` checks. Run `npx caits init .` to write it.\n");
    expect(stderr).not.toMatch(/\n +at /);
  });

  test.for([["1 architecture violation.", 1], ["2 architecture violations.", 2]])("architecture: counts the violations: %s", ([total, count]) => {
    const folder = newFolder();
    mkdirSync(join(folder, "quality"));
    const rule = `{ name: "always-wrong", description: "Fails.", on: "project", check: () => Array.from({ length: ${count} }, (_, index) => ({ file: "f" + index, message: "wrong" })) }`;
    writeFileSync(join(folder, "quality/architecture.mjs"), `export default [${rule}];\n`);

    const { status, stderr } = caits(folder, "architecture");

    expect(status).toBe(1);
    expect(stderr).toContain(`f0 [always-wrong] wrong\n`);
    expect(stderr).toMatch(new RegExp(`\\n${total}\\n$`));
  });

  test("architecture: prints each violation at its line, when the rule points at one", () => {
    const folder = newFolder();
    mkdirSync(join(folder, "quality"));
    const rule = `{ name: "always-wrong", description: "Fails.", on: "project", check: () => [{ file: "src/a.ts", line: 3, message: "It is wrong. Fix it." }, { file: "src/b.ts", message: "It is wrong too." }] }`;
    writeFileSync(join(folder, "quality/architecture.mjs"), `export default [${rule}];\n`);

    const { stderr } = caits(folder, "architecture");

    expect(stderr.endsWith("src/a.ts:3 [always-wrong] It is wrong. Fix it.\nsrc/b.ts [always-wrong] It is wrong too.\n\n2 architecture violations.\n")).toBe(true);
  });

  describe("in a terminal, with colors", () => {
    test("an error in red, and where to read the usage dim", () => {
      expect(caitsInColor(newFolder(), "deploy").stderr).toBe(`${red("Unknown command: deploy.")}\n${dim("Run `caits --help`.")}\n`);
    });

    test("architecture: the file and its line in cyan, the rule dim, the message as it is, and the count in red", () => {
      const folder = newFolder();
      mkdirSync(join(folder, "quality"));
      const rule = `{ name: "always-wrong", description: "Fails.", on: "project", check: () => [{ file: "src/a.ts", line: 3, message: "It is wrong. Fix it." }] }`;
      writeFileSync(join(folder, "quality/architecture.mjs"), `export default [${rule}];\n`);

      const { stderr } = caitsInColor(folder, "architecture");

      expect(stderr.endsWith(`${cyan("src/a.ts:3")} ${dim("[always-wrong]")} It is wrong. Fix it.\n\n${red(bold("1 architecture violation."))}\n`)).toBe(true);
    });

    test("architecture: the project that respects every rule in green, and the warning of old defaults in yellow", () => {
      const folder = newFolder();
      mkdirSync(join(folder, "quality"));
      writeFileSync(join(folder, "quality/architecture.mjs"), "export default [];\n");

      const { stdout, stderr } = caitsInColor(folder, "architecture");

      expect(stdout).toBe(`${green("Architecture: 0 production files and 0 test files respect the 0 rules.")}\n`);
      expect(stderr).toBe(`${yellow("Warning:")} quality/caits/ is missing, but CAITS ${VERSION} is installed. Run \`npx caits update\`.\n\n`);
    });

    test("init: the files that it wrote in green, Next in bold, and the command of each step in cyan", () => {
      const { stdout } = caitsInColor(newFolder(), "init", "My App", "--no-install");

      expect(stdout).toMatch(new RegExp(`\\n${green("Wrote \\d+ files\\. CAITS owns those of quality/caits/: the others are yours\\.").replaceAll("[", "\\[")}\\n`));
      expect(stdout).toContain(`\n${bold("Next:")}\n  ${cyan("cd 'My App'")}\n  ${cyan("npm install")}\n  ${cyan("npx playwright install chromium")}\n  ${cyan("npm run dev")}      starts the app on http://localhost:3000\n`);
    });

    test("update: the files that it wrote in green, and the other versions that CAITS suggests in yellow", () => {
      const folder = newFolder();
      writeFileSync(join(folder, "package.json"), JSON.stringify({ devDependencies: { vitest: "^1.0.0" } }));

      const { stdout } = caitsInColor(folder, "update");

      expect(stdout).toMatch(new RegExp(`^${green(`CAITS ${VERSION}: wrote \\d+ files in quality/caits/\\.`).replaceAll("[", "\\[")}\\n`));
      expect(stdout).toContain(`${yellow(`CAITS ${VERSION} suggests other versions of these packages. Change them in package.json if you agree:`)}\n  vitest: "^1.0.0"`);
    });

    test("update: the packages that package.json lacks in yellow, and the commands that add them in cyan", () => {
      const folder = newFolder();
      writeFileSync(join(folder, "package.json"), JSON.stringify({ devDependencies: { vitest: "^1.0.0" } }));

      const { stdout } = caitsInColor(folder, "update");

      expect(stdout).toContain(`${yellow(`CAITS ${VERSION} needs packages that package.json does not have. Add them:`)}\n  ${cyan(`npm install "@marko/run@${SUGGESTED.dependencies["@marko/run"]}" "marko@${SUGGESTED.dependencies.marko}"`)}\n  \u001b[36mnpm install --save-dev "@eslint/js@`);
      expect(stdout).toContain(`"@stryker-mutator/vitest-runner@${SUGGESTED.devDependencies["@stryker-mutator/vitest-runner"]}"`);
    });
  });

  describe("architecture: the packages that each layer may import", () => {
    /** A project whose one rule says the packages that it reads. */
    function projectWithPackages(files: Record<string, string>) {
      const folder = newFolder();
      mkdirSync(join(folder, "quality/caits"), { recursive: true });
      const rule = `{ name: "packages", description: "Says the packages.", on: "project", check: ({ packages }) => [{ file: "quality", message: JSON.stringify(packages) }] }`;
      writeFileSync(join(folder, "quality/architecture.mjs"), `export default [${rule}];\n`);
      for (const [path, text] of Object.entries(files)) writeFileSync(join(folder, path), text);
      return caits(folder, "architecture").stderr;
    }

    test("are those of quality/imports.mjs, the file of the project", () => {
      expect(projectWithPackages({
        "quality/imports.mjs": 'export default { domain: ["uuid"] };\n',
        "quality/caits/imports.mjs": 'export const allowed = { domain: [] };\n'
      })).toContain('quality [packages] {"domain":["uuid"]}\n');
    });

    test("are those of CAITS, quality/caits/imports.mjs, when the project has none", () => {
      expect(projectWithPackages({ "quality/caits/imports.mjs": 'export const allowed = { domain: ["@ingenioz-it/caits/Token"] };\n' }))
        .toContain('quality [packages] {"domain":["@ingenioz-it/caits/Token"]}\n');
    });

    test("are none without either file: every layer imports any package", () => {
      expect(projectWithPackages({})).toContain("quality [packages] {}\n");
    });

    test("are lists of names, by the key of a layer", () => {
      expect(projectWithPackages({ "quality/imports.mjs": 'export default { domian: ["uuid"] };\n' }))
        .toContain("quality/imports.mjs must export the packages that each layer may import, as lists of names: { domain: […], application: […], presentation: […], infra: […], di: […], contextMap: […] } (domian)");
    });
  });

  describe("mutation: Stryker, then the score of each file and the survivors, also when Stryker fails", () => {
    const REPORT = "reports/mutation/mutation.json";
    type Mutant = { status: string; statusReason?: string };
    const mutant = ({ status, statusReason }: Mutant, line: number) => ({ status, statusReason, mutatorName: "EqualityOperator", replacement: "a >= b", location: { start: { line, column: 4 }, end: { line, column: 9 } } });
    const reportOf = (...mutants: (string | Mutant)[]) => ({ files: { "src/Message.ts": { source: "line 1\nif (a > b) throw\nwhile (a > b) a++\n", mutants: mutants.map((m, index) => mutant(typeof m === "string" ? { status: m } : m, index + 1)) } } });
    /** A mutant that the clock of Stryker stopped: Stryker gives no reason. */
    const late = { status: "Timeout" };
    /** A mutant that the counter of Stryker stopped: its code ran too many times. */
    const looping = { status: "Timeout", statusReason: "Hit limit reached (5/4)" };

    /**
     * A project whose Stryker is a fake: it says how it was called and where the tests write their temporary files, writes there, writes
     * the report when it has one, and exits with the code. A second report, when there is one, is that of a run that names its mutants.
     */
    function projectWithStryker(code: number, report?: unknown, { again, config = "export default {};\n" }: { again?: { code: number; report?: unknown }; config?: string } = {}) {
      const folder = newFolder();
      writeFileSync(join(folder, "package.json"), `{ "name": "app", "private": true }\n`);
      mkdirSync(join(folder, "quality/caits"), { recursive: true });
      writeFileSync(join(folder, "quality/stryker.config.mjs"), config);
      mkdirSync(join(folder, "node_modules/.bin"), { recursive: true });
      const write = (written: unknown) => written === undefined ? "" : `mkdir -p reports/mutation && cat > ${REPORT} <<'EOF'\n${JSON.stringify(written)}\nEOF\n`;
      const run = (outcome: { code: number; report?: unknown }) => `${write(outcome.report)}exit ${outcome.code}\n`;
      const second = again === undefined ? "" : `case "$*" in *--mutate*) ${run(again).replace(/\n$/, "")} ;; esac\n`;
      writeFileSync(join(folder, "node_modules/.bin/stryker"), `#!/bin/sh\necho "stryker $*"\necho "temporary $TMPDIR"\ntouch "$TMPDIR/left"\n${second}${run({ code, report })}`);
      chmodSync(join(folder, "node_modules/.bin/stryker"), 0o755);
      return folder;
    }

    test("under the threshold, gives the output of Stryker, then the survivors, and keeps the exit code of Stryker", () => {
      const folder = projectWithStryker(1, reportOf("Killed", "Survived"));

      const { status, stdout } = caits(folder, "mutation");

      expect(status).toBe(1);
      expect(stdout).toContain("stryker run quality/stryker.config.mjs\n");
      expect(stdout).toContain("Mutation score: 50.0%  (1 killed of 2 valid mutants)\n");
      expect(stdout).toContain("L2 [survived] EqualityOperator: if (a > b) throw  →  a >= b\n");
      expect(stdout.indexOf("stryker run")).toBeLessThan(stdout.indexOf("Mutation score"));
    });

    test("at 100%, gives the score of each file, and passes: a mutant that the counter of Stryker stopped loops, and is killed", () => {
      const folder = projectWithStryker(0, reportOf("Killed", looping));

      const { status, stdout } = caits(folder, "mutation");

      expect(status).toBe(0);
      expect(stdout).toContain("Mutation score: 100.0%  (2 killed of 2 valid mutants)\n");
      expect(stdout).not.toContain("[survived]");
      expect(stdout.match(/stryker run/g)).toHaveLength(1);
    });

    test("runs again, a few at once and with more time, the mutants that the clock stopped: their second result counts, under the threshold of the project", () => {
      const folder = projectWithStryker(0, reportOf("Killed", late, looping), {
        again: { code: 1, report: reportOf("Killed", "Survived") },
        config: "export default { thresholds: { break: 100 } };\n"
      });

      const { status, stdout } = caits(folder, "mutation");

      expect(status).toBe(1);
      expect(stdout).toContain("1 mutant ran out of time on the clock, which the load of the machine slows: it runs again, with more time and fewer tests at once.\n");
      expect(stdout).toContain("stryker run quality/stryker.config.mjs --mutate src/Message.ts:2-2 --concurrency 4 --timeoutFactor 3 --reporters json\n");
      expect(stdout).toContain("Mutation score: 66.7%  (2 killed of 3 valid mutants)\n");
      expect(stdout).toContain("L2 [survived] EqualityOperator: if (a > b) throw  →  a >= b\n");
      expect(stdout).not.toContain("L3 [survived]");
    });

    test("counts as killed a mutant that the clock stops again: it loops", () => {
      const folder = projectWithStryker(0, reportOf(late, late), { again: { code: 0, report: reportOf(late, "Killed") }, config: "export default { thresholds: { break: 100 } };\n" });

      const { status, stdout } = caits(folder, "mutation");

      expect(status).toBe(0);
      expect(stdout).toContain("2 mutants ran out of time on the clock, which the load of the machine slows: they run again, with more time and fewer tests at once.\n");
      expect(stdout).toContain("--mutate src/Message.ts:1-1,src/Message.ts:2-2 ");
      expect(stdout).toContain("Mutation score: 100.0%  (2 killed of 2 valid mutants)\n");
    });

    test("when the second run stops before its report, keeps the first, and fails", () => {
      const folder = projectWithStryker(0, reportOf("Killed", late), { again: { code: 2 } });

      const { status, stdout } = caits(folder, "mutation");

      expect(status).toBe(1);
      expect(stdout).toContain("Mutation score: 100.0%  (2 killed of 2 valid mutants)\n");
      expect(stdout).toContain("The second run stopped before its report: the mutants that the clock stopped count as killed, as Stryker counts them. Run the mutation tests again.\n");
      expect(JSON.parse(readFileSync(join(folder, REPORT), "utf8"))).toEqual(reportOf("Killed", late));
    });

    test("gives the tests a temporary folder of its own, which goes away at its end, with what a stopped test left in it", () => {
      const temporary = newFolder();
      vi.stubEnv("TMPDIR", temporary);
      try {
        const { stdout } = caits(projectWithStryker(0, reportOf("Killed")), "mutation");

        const folder = /^temporary (.+)$/m.exec(stdout)?.[1] ?? "";
        expect(folder.startsWith(join(temporary, "caits-mutation-"))).toBe(true);
        expect(existsSync(folder)).toBe(false);
      } finally {
        vi.unstubAllEnvs();
      }
    });

    test("at its start, removes the temporary folders of the runs that stopped before their end", () => {
      const folder = projectWithStryker(0, reportOf("Killed"));
      const temporary = newFolder();
      const stopped = spawnSync(process.execPath, ["-e", ""]).pid;
      for (const run of [`caits-mutation-${stopped}-last`, `caits-mutation-${process.pid}-running`, "other"]) mkdirSync(join(temporary, run));
      vi.stubEnv("TMPDIR", temporary);
      try {
        expect(caits(folder, "mutation").status).toBe(0);
      } finally {
        vi.unstubAllEnvs();
      }

      const left = readdirSync(temporary);
      expect(left.filter(entry => entry.startsWith("caits-mutation-"))).toEqual([`caits-mutation-${process.pid}-running`]);
      expect(left).toContain("other");
    });

    test("gives its options to Stryker", () => {
      const { stdout } = caits(projectWithStryker(0, reportOf("Killed")), "mutation", "--concurrency", "2");

      expect(stdout).toContain("stryker run quality/stryker.config.mjs --concurrency 2\n");
    });

    test("when Stryker stops before its report, shows no summary, not even that of the run before, and fails", () => {
      const folder = projectWithStryker(2);
      mkdirSync(join(folder, "reports/mutation"), { recursive: true });
      writeFileSync(join(folder, REPORT), JSON.stringify(reportOf("Killed")));

      const { status, stdout } = caits(folder, "mutation");

      expect(status).toBe(2);
      expect(stdout).not.toContain("Mutation score");
      expect(existsSync(join(folder, REPORT))).toBe(false);
    });

    test("without quality/stryker.config.mjs, says how to write it, and runs nothing", () => {
      const folder = projectWithStryker(0, reportOf("Killed"));
      rmSync(join(folder, "quality/stryker.config.mjs"));

      const { status, stdout, stderr } = caits(folder, "mutation");

      expect(status).toBe(1);
      expect(stderr).toContain("quality/stryker.config.mjs is missing: it gives the configuration of the mutation tests. Run `npx caits init .` to write it.\n");
      expect(stdout).not.toContain("stryker run");
    });
  });

  test("mutation-summary: without the report of the mutation tests, says how to get it", () => {
    const folder = newFolder();
    mkdirSync(join(folder, "quality/caits"), { recursive: true });

    const { status, stderr } = caits(folder, "mutation-summary");

    expect(status).toBe(1);
    expect(stderr).toContain("reports/mutation/mutation.json is missing: run the mutation tests first (npm run test:mutation).\n");
    expect(stderr).not.toMatch(/\n +at /);
    expect(existsSync(join(folder, "reports"))).toBe(false);
  });
});
