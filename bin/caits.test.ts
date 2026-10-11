import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { VERSION } from "./init.js";

const CAITS = join(import.meta.dirname, "caits.js");

const folders: string[] = [];
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });

function newFolder(): string {
  const folder = mkdtempSync(join(tmpdir(), "caits-command-"));
  folders.push(folder);
  return folder;
}

/** Runs the command of CAITS in a folder: its exit code, and what it prints. */
function caits(cwd: string, ...args: string[]) {
  const { status, stdout, stderr } = spawnSync(process.execPath, [CAITS, ...args], { cwd, encoding: "utf8" });
  return { status, stdout, stderr };
}

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
    expect(stderr).toContain(`f0: wrong (always-wrong)\n`);
    expect(stderr).toMatch(new RegExp(`\\n${total}\\n$`));
  });

  describe("mutation: Stryker, then the score of each file and the survivors, also when Stryker fails", () => {
    const REPORT = "reports/mutation/mutation.json";
    const mutant = (status: string, line: number) => ({ status, mutatorName: "EqualityOperator", replacement: "a >= b", location: { start: { line } } });
    const reportOf = (...statuses: string[]) => ({ files: { "src/Message.ts": { source: "line 1\nif (a > b) throw\n", mutants: statuses.map((status, index) => mutant(status, index + 1)) } } });

    /** A project whose Stryker is a fake: it says how it was called, writes the report when it has one, and exits with the code. */
    function projectWithStryker(code: number, report?: unknown) {
      const folder = newFolder();
      writeFileSync(join(folder, "package.json"), `{ "name": "app", "private": true }\n`);
      mkdirSync(join(folder, "quality/caits"), { recursive: true });
      writeFileSync(join(folder, "quality/stryker.config.mjs"), "export default {};\n");
      mkdirSync(join(folder, "node_modules/.bin"), { recursive: true });
      const write = report === undefined ? "" : `mkdir -p reports/mutation && cat > ${REPORT} <<'EOF'\n${JSON.stringify(report)}\nEOF\n`;
      writeFileSync(join(folder, "node_modules/.bin/stryker"), `#!/bin/sh\necho "stryker $*"\n${write}exit ${code}\n`);
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

    test("at 100%, gives the score of each file, and passes", () => {
      const folder = projectWithStryker(0, reportOf("Killed", "Timeout"));

      const { status, stdout } = caits(folder, "mutation");

      expect(status).toBe(0);
      expect(stdout).toContain("Mutation score: 100.0%  (2 killed of 2 valid mutants)\n");
      expect(stdout).not.toContain("[survived]");
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
