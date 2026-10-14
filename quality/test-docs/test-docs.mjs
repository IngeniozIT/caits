import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { renderPage } from "./page.mjs";

/** @typedef {"passed" | "failed" | "skipped"} State */
/** A test of a run: its file, the names of its describes, its name, its state, and its error. @typedef {{ file: string; describes: string[]; name: string; state: State; error?: string }} Test */
/** The tests of a run, and when it ran. @typedef {{ ranAt: string; tests: Test[] }} RunResult */
/** A run of the page: unit or end-to-end, with its last result, or null. @typedef {{ kind: string; title: string; command: string; result: RunResult | null }} Run */
/** A describe of a file: its title, its tests and its describes in their order. @typedef {{ title: string; items: Item[]; describes: Map<string, Describe> }} Describe */
/** @typedef {{ test: Test; describe?: undefined } | { describe: Describe; test?: undefined }} Item */
/** An element of a group (a class, a file), with the describes of each of its files. @typedef {{ title: string; files: Map<string, Describe> }} Element */
/**
 * A group of the page: a project, a context, a layer. A group without an order keeps the order of the run.
 * @typedef {{ title: string; order: number | undefined; path: string[]; id: string; children: Map<string, Group>; elements: Map<string, Element> }} Group
 */

/** The root of the project: the tests run from it. */
const projectRoot = process.cwd();
const directory = join(projectRoot, "reports/test-docs");

const RUNS = {
  e2e: { title: "End-to-end tests", command: "npm run test:e2e" },
  unit: { title: "Unit tests", command: "npm run test:coverage" }
};

/** @type {(file: string) => unknown} */
const readJson = file => JSON.parse(readFileSync(file, "utf8"));

/** @type {Record<string, number>} */
const PROJECTS = { "End-to-end": 0, Backend: 1, Frontend: 2, Other: 3 };
const LAYERS = ["presentation", "command", "query", "event", "domain", "infra"];

/** A path relative to the project root, with "/" on every system. @type {(file: string) => string} */
export const fromProjectRoot = file => relative(projectRoot, file).split(sep).join("/");

/** Removes the terminal colors from an error message. @type {(text: string) => string} */
// eslint-disable-next-line no-control-regex -- a color of the terminal starts with the character ESC.
export const withoutColors = text => text.replace(/\u001b\[[0-9;]*m/g, "");

/**
 * Writes a file of the documentation whole: `caits check` runs the unit and the end-to-end tests at once, and each run reads the file of
 * the other one. The text goes in a file of its own, then takes the name of the file.
 * @param {string} file
 * @param {string} text
 */
function writeWhole(file, text) {
  const draft = `${file}.${process.pid}.tmp`;
  writeFileSync(draft, text);
  renameSync(draft, file);
}

/**
 * Keeps the tests of one run.
 * @param {"unit" | "e2e"} kind
 * @param {Test[]} tests
 */
export function saveRun(kind, tests) {
  mkdirSync(directory, { recursive: true });
  writeWhole(join(directory, `${kind}.json`), JSON.stringify({ ranAt: new Date().toISOString(), tests }, null, 2));
}

/** Writes reports/test-docs/index.html from the last unit run and the last e2e run. */
export function writeTestDocs() {
  /** @type {Run[]} */
  const runs = Object.entries(RUNS).map(([kind, run]) => ({ kind, ...run, result: readRun(kind) }));
  const root = node("", 0, []);
  for (const run of runs) for (const test of run.result?.tests ?? []) add(root, test);
  mkdirSync(directory, { recursive: true });
  const page = join(directory, "index.html");
  writeWhole(page, renderPage({ generatedAt: new Date(), runs, root }));
  return page;
}

/**
 * @param {string} kind
 * @returns {RunResult | null}
 */
function readRun(kind) {
  const file = join(directory, `${kind}.json`);
  return existsSync(file) ? /** @type {RunResult} */ (readJson(file)) : null;
}

/** A group without an order keeps the order of the run: the e2e features stay in the order of the spec file. @type {(title: string, order: number | undefined) => { title: string; order: number | undefined }} */
const group = (title, order) => ({ title, order });
/** @type {(name: string) => string} */
const humanize = name => name.charAt(0).toUpperCase() + name.slice(1).replace(/[-_]+/g, " ");

/**
 * Where a test goes in the page: the groups (project, context, layer), the element in the last group, and its describes.
 * @param {Test} test
 */
function placeOf({ file, describes }) {
  const parts = file.split("/");
  const folders = parts.slice(0, -1);
  const stem = parts[parts.length - 1].replace(/\.(test|spec)\.[cm]?[jt]s$/, "");

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

/**
 * @param {string} title
 * @param {number | undefined} order
 * @param {string[]} path
 * @returns {Group}
 */
function node(title, order, path) {
  return { title, order, path, id: path.map(slug).join("--"), children: new Map(), elements: new Map() };
}

/**
 * @param {string} title
 * @returns {Element}
 */
function elementNode(title) {
  return { title, files: new Map() };
}

/**
 * @param {string} title
 * @returns {Describe}
 */
function describeNode(title) {
  return { title, items: [], describes: new Map() };
}

/**
 * Puts a test in its place: in its groups, its element, its file and its describes, each made when the page does not have it yet.
 * @param {Group} root
 * @param {Test} test
 */
function add(root, test) {
  const { groups, element, describes } = placeOf(test);
  let current = root;
  for (const { title, order } of groups) {
    const parent = current;
    current = entryOf(parent.children, title, () => node(title, order, [...parent.path, title]));
  }
  const { files } = entryOf(current.elements, element, () => elementNode(element));
  let describe = entryOf(files, test.file, () => describeNode(""));
  for (const title of describes) {
    const parent = describe;
    describe = entryOf(parent.describes, title, () => {
      const child = describeNode(title);
      parent.items.push({ describe: child });
      return child;
    });
  }
  describe.items.push({ test });
}

/**
 * The value of a key of a map: `make` makes it, and the map keeps it, when the map does not have it yet.
 * @template Value
 * @param {Map<string, Value>} map
 * @param {string} key
 * @param {() => Value} make
 * @returns {Value}
 */
function entryOf(map, key, make) {
  let value = map.get(key);
  if (value === undefined) {
    value = make();
    map.set(key, value);
  }
  return value;
}

/** @type {(title: string) => string} */
const slug = title => title.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
