import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";
import { colors, commandOf, plain } from "./terminal.mjs";

/**
 * What the painter of the output gives for a red "x", in a process whose output is a pipe, with these variables.
 * @param {Record<string, string>} variables
 */
function paintedIn(variables) {
  const { FORCE_COLOR: _force, NO_COLOR: _no, ...env } = process.env;
  const command = `import { painterOf } from ${JSON.stringify(new URL("./terminal.mjs", import.meta.url).href)};\nprocess.stdout.write(painterOf(process.stdout)(["red", "bold"], "x"));`;
  return spawnSync(process.execPath, ["--input-type=module", "-e", command], { env: { ...env, ...variables }, encoding: "utf8" }).stdout;
}

/** A painter that marks each style in the text: `<cyan>…</>`. @type {import("./terminal.mjs").Paint} */
const marks = (style, text) => `<${[style].flat().join(" ")}>${text}</>`;

describe("the colors of the outputs", () => {
  test("in a pipe, a painter gives the text as it is: an AI agent and a log read no code of color", () => {
    expect(paintedIn({})).toBe("x");
  });

  test("FORCE_COLOR asks for the colors, also in a pipe", () => {
    expect(paintedIn({ FORCE_COLOR: "1" })).toBe("\u001b[31m\u001b[1mx\u001b[22m\u001b[39m");
  });

  test("NO_COLOR turns them off", () => {
    expect(paintedIn({ NO_COLOR: "1" })).toBe("x");
  });

  test("tells whether a painter colors", () => {
    expect(colors(plain)).toBe(false);
    expect(colors(marks)).toBe(true);
  });

  test.for([
    ["npm run dev      starts the app on http://localhost:3000", "<cyan>npm run dev</>      starts the app on http://localhost:3000"],
    ["cd 'my app'", "<cyan>cd 'my app'</>"],
    ["npx playwright install chromium", "<cyan>npx playwright install chromium</>"]
  ])("colors the command of a step in cyan, and leaves its explanation: %s", ([step, painted]) => {
    expect(commandOf(step, marks)).toBe(painted);
  });
});
