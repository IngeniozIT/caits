import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { readMarko } from "./architecture/adapters/marko.mjs";
import { readScss } from "./architecture/adapters/scss.mjs";
import { readTypeScript } from "./architecture/adapters/typescript.mjs";
import { isTestCode, LISTS, locate, resolveImport } from "./architecture/project.mjs";
import { painterOf } from "./terminal.mjs";

/** What a rule knows of the project. The rules of CAITS use it, and the rules of a project can use it too. */
export * from "./architecture/project.mjs";

/** @import { File, Import, Located, Messages, Packages, Rule } from "./architecture/project.mjs" */
/** A rule that a file breaks: the rule, the file, the message, and the line of the construct that breaks it, if the rule points at one. @typedef {{ rule: string; file: string; message: string; line?: number }} Violation */

/** The file of a project that gives its rules: its default export is the list of the rules. */
export const RULES_FILE = "quality/architecture.mjs";
/** The file of a project that gives the packages that each layer may import: its default export. Without it, those of CAITS apply. */
export const PACKAGES_FILE = "quality/imports.mjs";
/** The packages that each layer may import in CAITS (`caits update` writes them): their export `allowed`. */
export const DEFAULT_PACKAGES_FILE = "quality/caits/imports.mjs";

/**
 * Checks the rules on the files of a project. Each source is a file: its path from the root of the project, and its text. The packages
 * are those that each layer may import: the rules read them in the project.
 * Gives the production files, the test files, and each violation: its rule, its file, its message, and its line.
 * @param {string} root
 * @param {{ path: string; text: string }[]} sources
 * @param {Rule[]} rules
 * @param {Packages} [packages]
 * @returns {{ production: number; tests: number; violations: Violation[] }}
 */
export function checkArchitecture(root, sources, rules, packages = {}) {
  checkRules(rules);
  checkPackages(packages);
  const paths = new Set(sources.map(({ path }) => path));
  /** @type {(path: string, text: string) => import("./architecture/facts.mjs").Facts} */
  const read = (path, text) => {
    if (path.endsWith(".marko")) return readMarko(join(root, path), text, root);
    return path.endsWith(".scss") ? readScss(path, text, paths) : readTypeScript(path, text);
  };
  /** @type {File[]} */
  const files = sources.map(({ path, text }) => ({ path, ...read(path, text) }));
  const production = files.filter(file => !isTestCode(file.path));
  const project = { root, files, paths, packages };

  /** @type {Violation[]} */
  const violations = [];
  /** @type {(rule: Rule, file: string, located: Located) => void} */
  const report = (rule, file, { line, message }) => { violations.push({ rule: rule.name, file, message, ...(line === undefined ? {} : { line }) }); };
  /** The messages of a check, each with its line, or the line of the import for a rule on the imports. @type {(result: Messages, line?: number) => Located[]} */
  const messagesOf = (result, line) => (!result ? [] : Array.isArray(result) ? result : [result])
    .map(message => typeof message === "string" ? { line, message } : { ...message, line: message.line ?? line });

  for (const rule of rules) {
    if (rule.on === "file") {
      for (const file of rule.production ? production : files) {
        for (const located of messagesOf(rule.check(file, project))) report(rule, file.path, located);
      }
    }
    if (rule.on === "project") {
      for (const { file, ...located } of rule.check(project)) report(rule, file, located);
    }
  }

  const importRules = rules.filter(/** @returns {rule is Extract<Rule, { on: "import" }>} */ rule => rule.on === "import");
  for (const file of production) {
    const from = locate(file.path);
    file.imports.forEach((specifier, index) => {
      const { internal, target } = resolveImport(file.path, specifier, root);
      /** @type {Import} */
      const link = { file, from, to: internal ? locate(target) : { kind: "other" }, specifier, internal, target, line: file.lines.imports[index] };
      for (const rule of importRules) {
        for (const located of messagesOf(rule.check(link, project), link.line)) report(rule, file.path, located);
      }
    });
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

/**
 * Each list of packages has the key of a layer (see LISTS), and holds names of packages.
 * @param {unknown} packages
 * @returns {asserts packages is Packages}
 */
function checkPackages(packages) {
  const keys = new Set(Object.values(LISTS));
  const lists = packages !== null && typeof packages === "object" && !Array.isArray(packages) ? Object.entries(packages) : null;
  const wrong = lists?.find(([key, list]) => !keys.has(/** @type {keyof Packages} */ (key)) || !Array.isArray(list) || list.some(entry => typeof entry !== "string"));
  if (!lists || wrong) {
    throw new Error(`${PACKAGES_FILE} must export the packages that each layer may import, as lists of names: { ${[...keys].map(key => `${key}: […]`).join(", ")} }${wrong ? ` (${wrong[0]})` : ""}`);
  }
}

/** @type {(file: string) => Promise<unknown>} */
const importFile = file => import(pathToFileURL(file).href);

/**
 * The packages that each layer of a project may import: those of its quality/imports.mjs, else those of CAITS (quality/caits/imports.mjs),
 * else none: then every layer imports any package.
 * @param {string} root
 * @returns {Promise<unknown>}
 */
async function packagesOf(root) {
  if (existsSync(join(root, PACKAGES_FILE))) return /** @type {{ default: unknown }} */ (await importFile(join(root, PACKAGES_FILE))).default;
  if (existsSync(join(root, DEFAULT_PACKAGES_FILE))) return /** @type {{ allowed: unknown }} */ (await importFile(join(root, DEFAULT_PACKAGES_FILE))).allowed;
  return {};
}

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
  const packages = /** @type {Packages} */ (await packagesOf(root));
  const { production, tests, violations } = checkArchitecture(root, sources, rules, packages);

  if (violations.length === 0) {
    console.log(painterOf(process.stdout)("green", `Architecture: ${production} production files and ${tests} test files respect the ${rules.length} rules.`));
    return 0;
  }
  const paint = painterOf(process.stderr);
  for (const violation of violations) console.error(lineOf(violation, paint));
  console.error(`\n${paint(["red", "bold"], `${violations.length} architecture ${violations.length === 1 ? "violation" : "violations"}.`)}`);
  return 1;
}

/**
 * The line of a violation: the file and its line in cyan, the rule dim, then the message.
 * @param {Violation} violation
 * @param {import("./terminal.mjs").Paint} paint
 */
export function lineOf({ rule, file, message, line }, paint) {
  return `${paint("cyan", `${file}${line ? `:${line}` : ""}`)} ${paint("dim", `[${rule}]`)} ${message}`;
}
