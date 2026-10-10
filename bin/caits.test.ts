import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
