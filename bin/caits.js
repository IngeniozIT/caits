#!/usr/bin/env node
// The command of CAITS. Without installing CAITS first: npx github:IngeniozIT/caits#v<version> init my-app
import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { defaultsVersions, DEFAULTS_FOLDER, init, install, otherVersions, SOURCE, update, VERSION } from "./init.js";

const USAGE = `Usage: caits <command>

  init [folder]        Makes a CAITS project in the folder, or adds CAITS to the project in it (the current folder if you give
                       none: it must have a package.json). It writes only the files that the project does not have, and adds to
                       package.json only the values that it does not have. Then it installs the packages and the browser of the
                       end-to-end tests.
    --caits <source>   Where npm gets CAITS. Default: ${SOURCE}
    --no-install       Write the files, but install nothing.
  update               Writes the defaults of the installed CAITS in ${DEFAULTS_FOLDER}/. Run it after you install another version.
  dev                  Starts the development server.
  architecture         Checks the rules of quality/architecture.mjs.
  e2e                  Runs the end-to-end tests on the production build.
  mutation-summary     Gives the mutation score of each file (--survivors: the mutants that survived).
  mutation-suite       The unit tests, as Stryker runs them for each mutant.`;

/** The commands that run a tool of quality/: their code is in the folder quality/ of CAITS. */
const TOOLS = new Set(["dev", "architecture", "e2e", "mutation-summary", "mutation-suite"]);

/** @type {(count: number, noun: string) => string} */
const count = (count, noun) => `${count} ${noun}${count === 1 ? "" : "s"}`;

const [command, ...rest] = process.argv.slice(2);

if (command === "init") {
  const { values: options, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { caits: { type: "string" }, "no-install": { type: "boolean" } } });
  if (positionals.length > 1) fail();
  else if (positionals.length === 0 && !existsSync("package.json")) {
    console.error("This folder has no package.json. Give the folder of the new project (`caits init my-app`), or `caits init .` to use this folder.");
    process.exitCode = 1;
  } else runInit(resolve(positionals[0] ?? "."), options.caits, !options["no-install"]);
} else if (command === "update") {
  const written = update(process.cwd());
  console.log(`CAITS ${VERSION}: wrote ${count(written.length, "file")} in ${DEFAULTS_FOLDER}/.`);
  printOtherVersions(process.cwd());
} else if (command && TOOLS.has(command)) {
  if (command !== "mutation-suite") warnOfOldDefaults(process.cwd());
  // The tools load Vite, Marko and the other packages of the project: only the command that runs imports its code.
  const tool = /** @type {{ run: (args: string[]) => Promise<number | void> }} */ (await importTool(command));
  const status = await tool.run(rest);
  if (typeof status === "number") process.exitCode = status;
} else if (command === "--help" || command === "-h") {
  console.log(USAGE);
} else {
  fail();
}

/**
 * @param {string} name
 * @returns {Promise<unknown>}
 */
function importTool(name) {
  return import(new URL(`../quality/${name}.mjs`, import.meta.url).href);
}

function fail() {
  console.error(USAGE);
  process.exitCode = 1;
}

/**
 * @param {string} root
 * @param {string | undefined} caits
 * @param {boolean} withInstall
 */
function runInit(root, caits, withInstall) {
  console.log(`CAITS ${VERSION}: ${root}\n`);
  const { written, kept, ignored, values } = init(root, caits);
  console.log(`Wrote ${count(written.length, "file")}. CAITS owns those of ${DEFAULTS_FOLDER}/: the others are yours.`);
  if (kept.length > 0) {
    console.log(`Kept ${count(kept.length, "file")} that the project has already: ${kept.join(", ")}.`);
    console.log("  Compare them with those of node_modules/@ingeniozit/caits/template/project/ (without the dot at the start of the name).");
  }
  if (ignored.length > 0) console.log(`Added to .gitignore: ${ignored.join(" ")}`);
  if (values.length > 0) {
    console.log("Kept the values that package.json has already:");
    for (const { key, project, caits } of values) console.log(`  ${key}: ${JSON.stringify(project)} (CAITS: ${JSON.stringify(caits)})`);
  }

  const cd = relative(process.cwd(), root);
  const steps = [...(cd ? [`cd ${cd}`] : []), ...(withInstall ? [] : ["npm install", "npx playwright install chromium"])];
  if (withInstall && !install(root)) {
    console.error("\nThe installation failed. Correct the problem, then run the same command again: it keeps the files that it wrote.");
    process.exitCode = 1;
    return;
  }
  console.log("\nNext:");
  for (const step of [...steps, "npm run dev      starts the app on http://localhost:3000", "npm run check    runs all the checks"]) console.log(`  ${step}`);
}

/** @param {string} root */
function printOtherVersions(root) {
  const others = otherVersions(root);
  if (others.length === 0) return;
  console.log(`CAITS ${VERSION} suggests other versions of these packages. Change them in package.json if you agree:`);
  for (const { key, project, caits } of others) console.log(`  ${key}: ${JSON.stringify(project)} (CAITS suggests ${JSON.stringify(caits)})`);
}

/** @param {string} root */
function warnOfOldDefaults(root) {
  const versions = defaultsVersions(root);
  if (versions.length === 1 && versions[0] === VERSION) return;
  const from = versions.length === 0 ? "is missing" : `comes from CAITS ${versions.join(", ")}`;
  console.warn(`Warning: ${DEFAULTS_FOLDER}/ ${from}, but CAITS ${VERSION} is installed. Run \`npx caits update\`.\n`);
}
