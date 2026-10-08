import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { readMarko } from "./architecture/adapters/marko.mjs";
import { readTypeScript } from "./architecture/adapters/typescript.mjs";
import { isTestCode, locate, resolveImport } from "./architecture/project.mjs";

/** What a rule knows of the project. The rules of CAITS use it, and the rules of a project can use it too. */
export * from "./architecture/project.mjs";

/** The file of a project that gives its rules: its default export is the list of the rules. */
export const RULES_FILE = "quality/architecture.mjs";

/**
 * Checks the rules on the files of a project. Each source is a file: its path from the root of the project, and its text.
 * Gives the production files, the test files, and each violation: its rule, its file, its message, and the import that breaks it.
 */
export function checkArchitecture(root, sources, rules) {
  checkRules(rules);
  const files = sources.map(({ path, text }) => ({ path, ...(path.endsWith(".marko") ? readMarko(join(root, path), text) : readTypeScript(path, text)) }));
  const production = files.filter(file => !isTestCode(file.path));
  const project = { root, files, paths: new Set(files.map(file => file.path)) };

  const violations = [];
  const report = (rule, file, message, subject) => violations.push({ rule: rule.name, file, message, subject });
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

  const importRules = rules.filter(({ on }) => on === "import");
  for (const file of production) {
    const from = locate(file.path);
    for (const specifier of file.imports) {
      const { internal, target } = resolveImport(file.path, specifier, root);
      const link = { file, from, to: internal ? locate(target) : { kind: "other" }, specifier, internal, target };
      for (const rule of importRules) {
        const message = rule.check(link);
        if (message) report(rule, file.path, message, target);
      }
    }
  }

  return { production: production.length, tests: files.length - production.length, violations };
}

/** Each rule has its own kebab-case name, a description, reads an import, a file or the project, and has a check. */
function checkRules(rules) {
  if (!Array.isArray(rules)) throw new Error(`${RULES_FILE} must export a list of rules`);
  const seen = new Set();
  for (const rule of rules) {
    const valid = /^[a-z]+(-[a-z]+)*$/.test(rule?.name ?? "") && rule.description && ["import", "file", "project"].includes(rule.on) && typeof rule.check === "function";
    if (!valid) throw new Error(`each rule has a kebab-case name, a description, reads an import, a file or the project ("on"), and has a check: ${rule?.name ?? JSON.stringify(rule)}`);
    if (seen.has(rule.name)) throw new Error(`two rules have the name ${rule.name}`);
    seen.add(rule.name);
  }
}

/** `caits architecture`: checks the rules of quality/architecture.mjs on the files of src/ and test/. */
export async function run() {
  const root = process.cwd();
  const { default: rules } = await import(pathToFileURL(join(root, RULES_FILE)).href);
  const walk = directory => !existsSync(directory) ? [] : readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
  const sources = [...walk(join(root, "src")), ...walk(join(root, "test"))]
    .filter(path => /\.(ts|marko)$/.test(path))
    .map(absolute => ({ path: relative(root, absolute).replaceAll("\\", "/"), text: readFileSync(absolute, "utf8") }));
  const { production, tests, violations } = checkArchitecture(root, sources, rules);

  if (violations.length === 0) {
    console.log(`Architecture: ${production} production files and ${tests} test files respect the ${rules.length} rules.`);
    return 0;
  }
  for (const { rule, file, message, subject } of violations) console.error(`${file}${subject ? ` → ${subject}` : ""}: ${message} (${rule})`);
  console.error(`\n${violations.length} architecture violation(s).`);
  return 1;
}
