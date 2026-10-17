import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { check } from "./check.mjs";
import { plain } from "./terminal.mjs";

/** A check that waits for the file of another one: it passes only when the two run at the same time. @type {(other: string) => string} */
const waitsFor = other => `import { existsSync, writeFileSync } from "node:fs";
writeFileSync(process.argv[2], "");
const end = Date.now() + 10_000;
while (!existsSync("${other}") && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 20));
process.exit(existsSync("${other}") ? 0 : 1);
`;

const FILES = {
  "first.mjs": waitsFor("second.started"),
  "second.mjs": waitsFor("first.started"),
  "passes.mjs": "console.log(\"the output of a check that passes\");\n",
  "fails.mjs": "console.log(\"the output of a check that fails\");\nprocess.exit(1);\n",
  "out-dir.mjs": "import { writeFileSync } from \"node:fs\";\nwriteFileSync(process.argv[2], process.env.CAITS_OUT_DIR ?? \"\");\n",
  "waits.mjs": "import { writeFileSync } from \"node:fs\";\nwriteFileSync(\"waits.pid\", String(process.pid));\nsetTimeout(() => {}, 60_000);\n",
  "colors.mjs": "import { writeFileSync } from \"node:fs\";\nwriteFileSync(process.argv[2], `${process.env.FORCE_COLOR ?? \"\"}|${process.env.NO_COLOR ?? \"\"}`);\n"
};

const SCRIPTS = {
  first: "node first.mjs first.started",
  second: "node second.mjs second.started",
  passes: "node passes.mjs",
  fails: "node fails.mjs",
  "test:unit": "node out-dir.mjs unit.out",
  "test:e2e": "node out-dir.mjs e2e.out",
  waits: "node waits.mjs",
  colors: "node colors.mjs colors.out"
};

/** @type {string[]} */
const folders = [];
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });

function newProject() {
  const root = mkdtempSync(join(tmpdir(), "caits-check-"));
  folders.push(root);
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "checked", private: true, scripts: SCRIPTS }));
  for (const [file, text] of Object.entries(FILES)) writeFileSync(join(root, file), text);
  return root;
}

/** A painter that marks each style in the text, as a terminal colors it: `<red bold>…</>`. @type {import("./terminal.mjs").Paint} */
const marks = (style, text) => `<${[style].flat().join(" ")}>${text}</>`;

/**
 * @param {string} root
 * @param {string[]} scripts
 * @param {import("./terminal.mjs").Paint} [paint] without colors, by default
 */
async function checkOf(root, scripts, paint = plain) {
  /** @type {string[]} */
  const lines = [];
  const status = await check(root, scripts, line => lines.push(line), paint);
  return { status, report: lines.join("\n") };
}

describe("caits check", () => {
  test("runs the checks at the same time, and passes when they all pass", async () => {
    const { status, report } = await checkOf(newProject(), ["first", "second"]);

    expect(status).toBe(0);
    expect(report).toMatch(/^2 checks at once: first, second$/m);
    expect(report).toMatch(/^✓ first +\d+s$/m);
    expect(report).toMatch(/^✓ second +\d+s$/m);
    expect(report).toMatch(/^All 2 checks passed in \d+s\.$/m);
  }, 30_000);

  test("shows the output of the checks that fail, and only theirs, then names them", async () => {
    const { status, report } = await checkOf(newProject(), ["passes", "fails"]);

    expect(status).toBe(1);
    expect(report).toMatch(/^✓ passes +\d+s$/m);
    expect(report).toMatch(/^✗ fails +\d+s$/m);
    expect(report).toContain("── fails ──\nthe output of a check that fails");
    expect(report).not.toContain("the output of a check that passes");
    expect(report).toMatch(/^1 of 2 checks failed: fails\.$/m);
  }, 30_000);

  test("names the scripts that package.json does not have, and runs no check", async () => {
    const root = newProject();

    const { status, report } = await checkOf(root, ["test:unit", "missing", "other"]);

    expect(status).toBe(1);
    expect(report).toBe("package.json has no script missing, other.");
    expect(existsSync(join(root, "unit.out"))).toBe(false);
  });

  test("gives each check a build folder of its own", async () => {
    const root = newProject();

    await checkOf(root, ["test:unit", "test:e2e"]);

    expect(readFileSync(join(root, "unit.out"), "utf8")).toBe(join("node_modules/.caits/check", "test-unit"));
    expect(readFileSync(join(root, "e2e.out"), "utf8")).toBe(join("node_modules/.caits/check", "test-e2e"));
  }, 30_000);

  /** @type {[NodeJS.Signals, number][]} */
  const signals = [["SIGINT", 130], ["SIGTERM", 143]];
  test.for(signals)("when %s stops it, stops the checks, and exits with %i", { timeout: 30_000 }, async ([signal, code]) => {
    const root = newProject();
    const command = `import { check } from ${JSON.stringify(new URL("./check.mjs", import.meta.url).href)};\nawait check(${JSON.stringify(root)}, ["waits"], () => {});`;
    const caits = spawn(process.execPath, ["--input-type=module", "-e", command], { stdio: "ignore" });
    const exited = new Promise(resolve => caits.on("exit", resolve));
    await expect.poll(() => existsSync(join(root, "waits.pid")), { timeout: 10_000 }).toBe(true);
    const check = Number(readFileSync(join(root, "waits.pid"), "utf8"));

    caits.kill(signal);

    expect(await exited).toBe(code);
    await expect.poll(() => { try { process.kill(check, 0); return "runs"; } catch { return "stopped"; } }).toBe("stopped");
  });

  test("without a script, tells how to give them", async () => {
    const { status, report } = await checkOf(newProject(), []);

    expect(status).toBe(1);
    expect(report).toBe("Give the npm scripts of the checks: caits check typecheck lint test");
  });

  describe("in a terminal", () => {
    test("colors the report: the checks dim, each mark, each duration dim, the header of a failed check bold, and the end", async () => {
      const { report } = await checkOf(newProject(), ["passes", "fails"], marks);

      expect(report).toMatch(/^<dim>2 checks at once: passes, fails<\/>$/m);
      expect(report).toMatch(/^<green>✓<\/> passes {2}<dim>\d+s<\/>$/m);
      expect(report).toMatch(/^<red>✗<\/> fails {3}<dim>\d+s<\/>$/m);
      expect(report).toContain("<bold>── fails ──</>\nthe output of a check that fails");
      expect(report).toMatch(/\n<red bold>1 of 2 checks failed: fails\.<\/>$/);
    }, 30_000);

    test("ends in green when every check passes", async () => {
      const { report } = await checkOf(newProject(), ["passes"], marks);

      expect(report).toMatch(/\n<green bold>All 1 checks passed in \d+s\.<\/>$/);
    }, 30_000);

    /** @type {[string[], string][]} */
    const errors = [[[], "Give the npm scripts of the checks: caits check typecheck lint test"], [["missing"], "package.json has no script missing."]];
    test.for(errors)("colors in red the error %j", async ([scripts, error]) => {
      const { report } = await checkOf(newProject(), scripts, marks);

      expect(report).toBe(`<red>${error}</>`);
    });

    test("runs the checks with FORCE_COLOR, so that the output of a check that fails keeps the colors of its tool", async () => {
      const root = newProject();

      await checkOf(root, ["colors"], marks);

      expect(readFileSync(join(root, "colors.out"), "utf8")).toBe("1|");
    }, 30_000);
  });

  test("in a pipe, runs the checks with NO_COLOR: an AI agent reads no code of color", async () => {
    const root = newProject();

    await checkOf(root, ["colors"]);

    expect(readFileSync(join(root, "colors.out"), "utf8")).toBe("|1");
  }, 30_000);
});
