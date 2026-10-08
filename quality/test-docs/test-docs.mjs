import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { renderPage } from "./page.mjs";

/** The root of the project: the tests run from it. */
const projectRoot = process.cwd();
const directory = join(projectRoot, "reports/test-docs");

const RUNS = {
  e2e: { title: "End-to-end tests", command: "npm run test:e2e" },
  unit: { title: "Unit tests", command: "npm run test:coverage" }
};

const PROJECTS = { "End-to-end": 0, Backend: 1, Frontend: 2, Other: 3 };
const LAYERS = ["presentation", "application", "domain", "infra"];

/** A path relative to the project root, with "/" on every system. */
export const fromProjectRoot = file => relative(projectRoot, file).split(sep).join("/");

/** Removes the terminal colors from an error message. */
export const withoutColors = text => text.replace(/\u001b\[[0-9;]*m/g, "");

/**
 * Writes a file of the documentation whole: `caits check` runs the unit and the end-to-end tests at once, and each run reads the file of
 * the other one. The text goes in a file of its own, then takes the name of the file.
 */
function writeWhole(file, text) {
  const draft = `${file}.${process.pid}.tmp`;
  writeFileSync(draft, text);
  renameSync(draft, file);
}

/** Keeps the tests of one run: `kind` is "unit" or "e2e"; each test is { file, describes, name, state, error? }. */
export function saveRun(kind, tests) {
  mkdirSync(directory, { recursive: true });
  writeWhole(join(directory, `${kind}.json`), JSON.stringify({ ranAt: new Date().toISOString(), tests }, null, 2));
}

/** Writes reports/test-docs/index.html from the last unit run and the last e2e run. */
export function writeTestDocs() {
  const runs = Object.entries(RUNS).map(([kind, run]) => ({ kind, ...run, result: readRun(kind) }));
  const root = node("", 0, []);
  for (const run of runs) for (const test of run.result?.tests ?? []) add(root, test);
  mkdirSync(directory, { recursive: true });
  const page = join(directory, "index.html");
  writeWhole(page, renderPage({ generatedAt: new Date(), runs, root }));
  return page;
}

function readRun(kind) {
  const file = join(directory, `${kind}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

/** A group without an order keeps the order of the run: the e2e features stay in the order of the spec file. */
const group = (title, order) => ({ title, order });
const humanize = name => name.charAt(0).toUpperCase() + name.slice(1).replace(/[-_]+/g, " ");

/** Where a test goes in the page: the groups (project, context, layer), the element in the last group, and its describes. */
function placeOf({ file, describes }) {
  const parts = file.split("/");
  const folders = parts.slice(0, -1);
  const stem = parts.at(-1).replace(/\.(test|spec)\.[cm]?[jt]s$/, "");

  if (folders[0] === "test" && folders[1] === "e2e") {
    return { groups: [group("End-to-end", PROJECTS["End-to-end"]), group(describes[0] ?? humanize(stem), undefined)], element: "", describes: describes.slice(1) };
  }
  if (folders[0] === "src" && (folders[1] === "backend" || folders[1] === "frontend")) {
    const project = group(humanize(folders[1]), PROJECTS[humanize(folders[1])]);
    const [context, layer, ...rest] = folders.slice(2);
    if (context === undefined) return { groups: [project, group(humanize(stem.split(".")[0]), 1)], element: stem, describes };
    if (layer === undefined) return { groups: [project, group(humanize(context), 0)], element: stem, describes };
    const layerOrder = LAYERS.includes(layer) ? LAYERS.indexOf(layer) : LAYERS.length;
    return { groups: [project, group(humanize(context), 0), group(humanize(layer), layerOrder)], element: rest.join(" / ") || stem, describes };
  }
  return { groups: [group("Other", PROJECTS.Other), group(folders.join("/") || ".", 0)], element: stem, describes };
}

function node(title, order, path) {
  return { title, order, path, id: path.map(slug).join("--"), children: new Map(), elements: new Map() };
}

function describeNode(title) {
  return { title, items: [], describes: new Map() };
}

function add(root, test) {
  const { groups, element, describes } = placeOf(test);
  let current = root;
  for (const { title, order } of groups) {
    if (!current.children.has(title)) current.children.set(title, node(title, order, [...current.path, title]));
    current = current.children.get(title);
  }
  if (!current.elements.has(element)) current.elements.set(element, { title: element, files: new Map() });
  const files = current.elements.get(element).files;
  if (!files.has(test.file)) files.set(test.file, describeNode(""));
  let describe = files.get(test.file);
  for (const title of describes) {
    if (!describe.describes.has(title)) {
      const child = describeNode(title);
      describe.describes.set(title, child);
      describe.items.push({ describe: child });
    }
    describe = describe.describes.get(title);
  }
  describe.items.push({ test });
}

const slug = title => title.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
