#!/usr/bin/env node
// The command of CAITS. Without installing CAITS first: npx caits init my-app
import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { defaultsVersions, DEFAULTS_FOLDER, EXAMPLE_SOURCE, init, install, otherVersions, SOURCE, update, VERSION } from "./init.js";

const USAGE = `Usage: caits <command>

  init [folder]        Makes a CAITS project in the folder, or adds CAITS to the project in it (the current folder if you give
                       none: it must have a package.json). It writes only the files that the project does not have, and adds to
                       package.json only the values that it does not have. Then it installs the packages and the browser of the
                       end-to-end tests.
    --example          Write a small app instead of an empty page: a menu, and a page where the user adds, edits and removes
                       messages, which the backend keeps in tmp/messages.json. Each layer and each kind of test is there. The
                       app is not in CAITS: git gets it from ${EXAMPLE_SOURCE}
    --example-source <source>
                       Write the example of this source: a git repository, with # and a tag or a branch, or a folder.
    --caits <source>   Where npm gets CAITS. Default: ${SOURCE}
    --no-install       Write the files, but install nothing.
  update               Writes the defaults of the installed CAITS in ${DEFAULTS_FOLDER}/. Run it after you install another version.
  dev                  Starts the development server.
  check <script>…      Runs the npm scripts of the checks at once. Shows the output of the checks that fail, and only theirs.
  architecture         Checks the rules of quality/architecture.mjs.
  e2e                  Runs the end-to-end tests on the production build.
  mutation-summary     Gives the mutation score of each file (--survivors: the mutants that survived).
  mutation-suite       The unit tests, as Stryker runs them for each mutant.

  --help, -h           Shows this help, also after a command (caits init --help).
  --version            Shows the version of CAITS.`;

/** The commands that run a tool of quality/: their code is in the folder quality/ of CAITS. */
const TOOLS = new Set(["dev", "check", "architecture", "e2e", "mutation-summary", "mutation-suite"]);

/** The options of `caits init`. */
const INIT_OPTIONS = /** @type {const} */ ({ caits: { type: "string" }, example: { type: "boolean" }, "example-source": { type: "string" }, "no-install": { type: "boolean" } });

/** A command, an option or an argument that CAITS does not take: CAITS says why, then where to read the usage. */
class UsageError extends Error {}

/** @type {(count: number, noun: string) => string} */
const count = (count, noun) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/** A folder as the shell reads it: in quotes when it has a space or another special character. */
const shellQuote = (/** @type {string} */ text) => /^[\w@%+=:,./-]+$/.test(text) ? text : `'${text.replaceAll("'", "'\\''")}'`;

const [command, ...rest] = process.argv.slice(2);

try {
  const status = await main(command, rest);
  if (typeof status === "number") process.exitCode = status;
} catch (error) {
  // A known problem has a message that tells what to do: the stack of the code of CAITS does not help.
  console.error(error instanceof Error ? error.message : error);
  if (error instanceof UsageError) console.error("Run `caits --help`.");
  process.exitCode = 1;
}

/**
 * Runs a command. Gives its exit code, or nothing when it keeps running (the development server).
 * @param {string | undefined} command
 * @param {string[]} args
 * @returns {Promise<number | void>}
 */
async function main(command, args) {
  if (command === undefined) {
    console.error(USAGE);
    return 1;
  }
  if (command === "--version") {
    console.log(VERSION);
    return 0;
  }
  if ([command, ...args].some(arg => arg === "--help" || arg === "-h")) {
    console.log(USAGE);
    return 0;
  }
  if (command === "init") return runInit(args);
  if (command === "update") return runUpdate(args);
  if (TOOLS.has(command)) {
    if (command !== "mutation-suite") warnOfOldDefaults(process.cwd());
    // The tools load Vite, Marko and the other packages of the project: only the command that runs imports its code.
    const tool = /** @type {{ run: (args: string[]) => Promise<number | void> }} */ (await importTool(command));
    return tool.run(args);
  }
  throw new UsageError(command.startsWith("-") ? `Unknown option: ${command}.` : `Unknown command: ${command}.`);
}

/**
 * @param {string} name
 * @returns {Promise<unknown>}
 */
function importTool(name) {
  return import(new URL(`../quality/${name}.mjs`, import.meta.url).href);
}

/**
 * The options and the other arguments of a command. An option that the command does not know, an option without its value, or with
 * a value that it does not take, is a UsageError.
 * @param {string[]} args
 * @param {Record<string, { type: "string" | "boolean" }>} options
 */
function parseOptions(args, options) {
  const { values, positionals, tokens } = parseArgs({ args, options, allowPositionals: true, strict: false, tokens: true });
  for (const token of tokens) {
    if (token.kind !== "option") continue;
    const type = options[token.name]?.type;
    if (!type) throw new UsageError(`Unknown option: ${token.rawName}.`);
    const value = token.inlineValue ? token.value : token.value?.startsWith("-") ? undefined : token.value;
    if (type === "string" && value === undefined) throw new UsageError(`The option ${token.rawName} needs a value: ${token.rawName} <value>.`);
    if (type === "boolean" && token.value !== undefined) throw new UsageError(`The option ${token.rawName} takes no value.`);
  }
  return { values, positionals };
}

/**
 * `caits init [folder]`.
 * @param {string[]} args
 * @returns {number}
 */
function runInit(args) {
  const { values, positionals } = parseOptions(args, INIT_OPTIONS);
  const options = /** @type {{ caits?: string; example?: boolean; "example-source"?: string; "no-install"?: boolean }} */ (values);
  if (positionals.length > 1) throw new UsageError(`init takes one folder, not ${positionals.length}: ${positionals.join(" ")}.`);
  if (positionals.length === 0 && !existsSync("package.json")) {
    console.error("This folder has no package.json. Give the folder of the new project (`caits init my-app`), or `caits init .` to use this folder.");
    return 1;
  }
  const root = resolve(positionals[0] ?? ".");
  const example = options["example-source"] ?? (options.example ? EXAMPLE_SOURCE : undefined);
  const withInstall = !options["no-install"];
  console.log(`CAITS ${VERSION}: ${root}\n`);
  if (example) console.log(`The example: ${example}\n`);
  const { written, kept, ignored, values: keptValues } = init(root, options.caits, { example });
  console.log(`Wrote ${count(written.length, "file")}. CAITS owns those of ${DEFAULTS_FOLDER}/: the others are yours.`);
  if (kept.length > 0) {
    console.log(`Kept ${count(kept.length, "file")} that the project has already: ${kept.join(", ")}.`);
    console.log("  Compare them with those of node_modules/caits/template/project/ (without the dot at the start of the name).");
  }
  if (ignored.length > 0) console.log(`Added to .gitignore: ${ignored.join(" ")}`);
  if (keptValues.length > 0) {
    console.log("Kept the values that package.json has already:");
    for (const { key, project, caits } of keptValues) console.log(`  ${key}: ${JSON.stringify(project)} (CAITS: ${JSON.stringify(caits)})`);
  }

  const cd = relative(process.cwd(), root);
  const steps = [...(cd ? [`cd ${shellQuote(cd)}`] : []), ...(withInstall ? [] : ["npm install", "npx playwright install chromium"])];
  if (withInstall && !install(root)) {
    console.error("\nThe installation failed. Correct the problem, then run the same command again: it keeps the files that it wrote.");
    return 1;
  }
  console.log("\nNext:");
  for (const step of [...steps, "npm run dev      starts the app on http://localhost:3000", "npm run check    runs all the checks"]) console.log(`  ${step}`);
  return 0;
}

/**
 * `caits update`.
 * @param {string[]} args
 * @returns {number}
 */
function runUpdate(args) {
  if (args.length > 0) throw new UsageError(`update takes no argument: ${args.join(" ")}.`);
  const written = update(process.cwd());
  console.log(`CAITS ${VERSION}: wrote ${count(written.length, "file")} in ${DEFAULTS_FOLDER}/.`);
  printOtherVersions(process.cwd());
  return 0;
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
