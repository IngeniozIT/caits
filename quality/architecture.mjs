import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { readMarko } from "./architecture/adapters/marko.mjs";
import { readScss } from "./architecture/adapters/scss.mjs";
import { readTypeScript } from "./architecture/adapters/typescript.mjs";
import { isTestCode, locate, resolveImport } from "./architecture/project.mjs";

/** What a rule knows of the project. The rules of CAITS use it, and the rules of a project can use it too. */
export * from "./architecture/project.mjs";

/** @import { File, Import, Messages, Rule } from "./architecture/project.mjs" */
/** @typedef {{ rule: string; file: string; message: string; subject?: string }} Violation */

/** The file of a project that gives its rules: its default export is the list of the rules. */
export const RULES_FILE = "quality/architecture.mjs";

/**
 * Checks the rules on the files of a project. Each source is a file: its path from the root of the project, and its text.
 * Gives the production files, the test files, and each violation: its rule, its file, its message, and the import that breaks it.
 * @param {string} root
 * @param {{ path: string; text: string }[]} sources
 * @param {Rule[]} rules
 * @returns {{ production: number; tests: number; violations: Violation[] }}
 */
export function checkArchitecture(root, sources, rules) {
  checkRules(rules);
  const paths = new Set(sources.map(({ path }) => path));
  /** @type {(path: string, text: string) => import("./architecture/facts.mjs").Facts} */
  const read = (path, text) => {
    if (path.endsWith(".marko")) return readMarko(join(root, path), text, root);
    return path.endsWith(".scss") ? readScss(path, text, paths) : readTypeScript(path, text);
  };
  /** @type {File[]} */
  const files = sources.map(({ path, text }) => ({ path, ...read(path, text) }));
  const production = files.filter(file => !isTestCode(file.path));
  const project = { root, files, paths };

  /** @type {Violation[]} */
  const violations = [];
  /** @type {(rule: Rule, file: string, message: string, subject?: string) => void} */
  const report = (rule, file, message, subject) => { violations.push({ rule: rule.name, file, message, subject }); };
  /** @type {(result: Messages) => string[]} */
  const messagesOf = result => !result ? [] : Array.isArray(result) ? result : [result];

  for (const rule of rules) {
    if (rule.on === "file") {
      for (const file of rule.production ? production : files) {
        for (const message of messagesOf(rule.check(file, project))) report(rule, file.path, message);
      }
    }
    if (rule.on === "project") {
      for (const { file, message } of rule.check(project)) report(rule, file, message);
    }
  }

  const importRules = rules.filter(/** @returns {rule is Extract<Rule, { on: "import" }>} */ rule => rule.on === "import");
  for (const file of production) {
    const from = locate(file.path);
    for (const specifier of file.imports) {
      const { internal, target } = resolveImport(file.path, specifier, root);
      /** @type {Import} */
      const link = { file, from, to: internal ? locate(target) : { kind: "other" }, specifier, internal, target };
      for (const rule of importRules) {
        for (const message of messagesOf(rule.check(link))) report(rule, file.path, message, target);
      }
    }
  }

  return { production: production.length, tests: files.length - production.length, violations };
}

/**
 * Each rule has its own kebab-case name, a description, reads an import, a file or the project, and has a check.
 * @param {unknown} rules
 * @returns {asserts rules is Rule[]}
 */
function checkRules(rules) {
  if (!Array.isArray(rules)) throw new Error(`${RULES_FILE} must export a list of rules`);
  /** @type {Set<string>} */
  const seen = new Set();
  for (const rule of /** @type {unknown[]} */ (rules)) {
    const { name, description, on, check } = /** @type {Partial<Record<string, unknown>>} */ (rule ?? {});
    const valid = typeof name === "string" && /^[a-z]+(-[a-z]+)*$/.test(name) && description && ["import", "file", "project"].includes(String(on)) && typeof check === "function";
    if (!valid) throw new Error(`each rule has a kebab-case name, a description, reads an import, a file or the project ("on"), and has a check: ${typeof name === "string" ? name : JSON.stringify(rule)}`);
    if (seen.has(name)) throw new Error(`two rules have the name ${name}`);
    seen.add(name);
  }
}

/** @type {(file: string) => Promise<unknown>} */
const importFile = file => import(pathToFileURL(file).href);

/** `caits architecture`: checks the rules of quality/architecture.mjs on the files of src/ and test/: the code, and the stylesheets (SCSS). */
export async function run() {
  const root = process.cwd();
  if (!existsSync(join(root, RULES_FILE))) throw new Error(`${RULES_FILE} is missing: it gives the rules that \`caits architecture\` checks. Run \`npx caits init .\` to write it.`);
  const { default: rules } = /** @type {{ default: Rule[] }} */ (await importFile(join(root, RULES_FILE)));
  /** @type {(directory: string) => string[]} */
  const walk = directory => !existsSync(directory) ? [] : readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
  const sources = [...walk(join(root, "src")), ...walk(join(root, "test"))]
    .filter(path => /\.(ts|marko|scss)$/.test(path))
    .map(absolute => ({ path: relative(root, absolute).replaceAll("\\", "/"), text: readFileSync(absolute, "utf8") }));
  const { production, tests, violations } = checkArchitecture(root, sources, rules);

  if (violations.length === 0) {
    console.log(`Architecture: ${production} production files and ${tests} test files respect the ${rules.length} rules.`);
    return 0;
  }
  for (const { rule, file, message, subject } of violations) console.error(`${file}${subject ? ` → ${subject}` : ""}: ${message} (${rule})`);
  console.error(`\n${violations.length} architecture ${violations.length === 1 ? "violation" : "violations"}.`);
  return 1;
}
