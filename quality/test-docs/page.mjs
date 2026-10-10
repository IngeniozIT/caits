/** @import { Describe, Element, Group, Item, Run, State, Test } from "./test-docs.mjs" */
/** What holds tests: a group (with its sub-groups), an element, or a describe. @typedef {{ items?: Item[]; files?: Map<string, Describe>; elements?: Map<string, Element>; children?: Map<string, Group> }} Part */
/** @typedef {Record<State, number> & { tests: number }} Count */

/** @type {Record<State, string>} */
const MARKS = { passed: "✓", failed: "✗", skipped: "○" };
const ERROR_LENGTH = 3000;
const NAV_DEPTH = 3;

/**
 * The whole page: the runs ({ kind, title, command, result }), a menu of the groups, and each test as one line of documentation.
 * @param {{ generatedAt: Date; runs: Run[]; root: Group }} page
 */
export function renderPage({ generatedAt, runs, root }) {
  const projects = sorted(root.children);
  const e2e = runs.find(run => run.kind === "e2e");
  const missingE2e = e2e?.result === null
    ? `<section class="project" id="end-to-end"><h2>End-to-end</h2><p class="note">Not run yet. Run <code>${e2e.command}</code>.</p></section>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Test documentation</title>
<style>${STYLE}</style>
</head>
<body>
<div class="layout">
<nav aria-label="Groups">
<a class="nav-home" href="#top">Test documentation</a>
<ul>${missingE2e ? `<li><a href="#end-to-end">End-to-end</a></li>` : ""}${projects.map(project => navItem(project, 1)).join("")}</ul>
</nav>
<main id="top">
<header>
<h1>Test documentation</h1>
<p class="lead">Each line is one test, and tells one thing that the code does. The end-to-end tests describe the whole application. The other tests describe each layer of each context.</p>
<div class="runs">${runs.map(runCard).join("")}</div>
<p class="generated">Page written ${date(generatedAt)}.</p>
</header>
<div class="toolbar">
<input type="search" id="search" placeholder="Search the tests" aria-label="Search the tests">
<label><input type="checkbox" id="failures"> Failures only</label>
<span id="shown" aria-live="polite"></span>
</div>
<p class="note" id="nothing" hidden>No test matches.</p>
${missingE2e}${projects.map(renderProject).join("")}
</main>
</div>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

/** @param {Run} run */
function runCard({ title, command, result }) {
  if (result === null) return `<div class="run"><div class="run-title">${title}</div><div class="muted">Not run yet. Run <code>${command}</code>.</div></div>`;
  const total = countOf(result.tests);
  return `<div class="run${total.failed ? " has-failures" : ""}"><div class="run-title">${title}</div><div class="muted">${date(new Date(result.ranAt))} · <code>${command}</code></div><div>${summary(total)}</div></div>`;
}

/**
 * @param {Group} group
 * @param {number} depth
 * @returns {string}
 */
function navItem(group, depth) {
  const children = depth < NAV_DEPTH ? sorted(group.children) : [];
  const total = countOf(testsOf(group));
  return `<li><a href="#${group.id}"${total.failed ? ` class="has-failures"` : ""}>${escape(group.title)}</a> <span class="count">${total.tests}</span>${children.length ? `<ul>${children.map(child => navItem(child, depth + 1)).join("")}</ul>` : ""}</li>`;
}

/** @param {Group} project */
function renderProject(project) {
  return `<section class="project" id="${project.id}" data-group>
<h2>${escape(project.title)} ${badge(project)}</h2>
${renderElements(project)}${sorted(project.children).map(child => renderGroup(child, 3)).join("")}
</section>
`;
}

/**
 * @param {Group} group
 * @param {number} level
 * @returns {string}
 */
function renderGroup(group, level) {
  return `<details open class="group level-${level}" id="${group.id}" data-group>
<summary><h${level}>${escape(group.title)}</h${level}> ${badge(group)}</summary>
<div class="group-body">${renderElements(group)}${sorted(group.children).map(child => renderGroup(child, level + 1)).join("")}</div>
</details>
`;
}

/** @param {Group} group */
function renderElements(group) {
  return [...group.elements.values()].sort((a, b) => a.title.localeCompare(b.title)).map(element => {
    const files = [...element.files.entries()].sort(([a], [b]) => a.localeCompare(b));
    const body = files.map(([file, describe]) => `<div class="file" data-group><div class="path">${escape(file)}</div>${renderItems(describe.items, file, [...group.path, element.title])}</div>`).join("");
    if (element.title === "") return body;
    return `<div class="element" data-group><div class="element-title"><code>${escape(element.title)}</code> ${badge(element)}</div>${body}</div>`;
  }).join("");
}

/**
 * @param {Item[]} items
 * @param {string} file
 * @param {string[]} context
 * @returns {string}
 */
function renderItems(items, file, context) {
  /** @type {string[]} */
  let tests = [];
  let html = "";
  const flush = () => { if (tests.length) html += `<ul class="tests">${tests.join("")}</ul>`; tests = []; };
  for (const item of items) {
    if (item.test) { tests.push(renderTest(item.test, context)); continue; }
    flush();
    html += `<div class="describe" data-group><div class="describe-title">${escape(item.describe.title)}</div><div class="describe-body">${renderItems(item.describe.items, file, [...context, item.describe.title])}</div></div>`;
  }
  flush();
  return html;
}

/**
 * @param {Test} test
 * @param {string[]} context
 */
function renderTest(test, context) {
  const search = [...context, test.file, test.name].join(" ").toLowerCase();
  const error = test.error ? `<pre class="error">${escape(test.error.length > ERROR_LENGTH ? `${test.error.slice(0, ERROR_LENGTH)}…` : test.error)}</pre>` : "";
  return `<li class="test ${test.state}" data-search="${escape(search)}"><span class="mark" title="${test.state}">${MARKS[test.state]}</span><div><span class="name">${testName(test.name)}</span>${error}</div></li>`;
}

/**
 * "Given …, When …, Then …" becomes three lines; any other name stays as it is.
 * @param {string} name
 */
function testName(name) {
  const steps = /^Given (.+?), When (.+?), Then (.+)$/s.exec(name);
  if (!steps) return escape(name);
  return `<span class="steps"><span><b>Given</b> ${escape(steps[1])}</span><span><b>When</b> ${escape(steps[2])}</span><span><b>Then</b> ${escape(steps[3])}</span></span>`;
}

/** @param {Part} group */
function badge(group) {
  const total = countOf(testsOf(group));
  return `<span class="count">${total.tests} ${total.tests === 1 ? "test" : "tests"}${total.failed ? ` · <span class="failed-count">${total.failed} failed</span>` : ""}${total.skipped ? ` · ${total.skipped} skipped` : ""}</span>`;
}

/** @param {Count} total */
function summary(total) {
  return [`${total.passed} passed`, total.failed ? `<span class="failed-count">${total.failed} failed</span>` : "", total.skipped ? `${total.skipped} skipped` : ""].filter(Boolean).join(" · ");
}

/**
 * @param {Iterable<Test>} tests
 * @returns {Count}
 */
function countOf(tests) {
  const total = { tests: 0, passed: 0, failed: 0, skipped: 0 };
  for (const test of tests) { total.tests++; total[test.state]++; }
  return total;
}

/**
 * All the tests of a group (with its sub-groups), of an element, or of a describe.
 * @param {Part} part
 * @returns {Generator<Test>}
 */
function* testsOf(part) {
  if (part.items) {
    for (const item of part.items) yield* item.test ? [item.test] : testsOf(item.describe);
    return;
  }
  for (const describe of part.files?.values() ?? []) yield* testsOf(describe);
  for (const element of part.elements?.values() ?? []) yield* testsOf(element);
  for (const child of part.children?.values() ?? []) yield* testsOf(child);
}

/**
 * The groups by their order, then by their title. The groups without an order keep the order of the run.
 * @type {(children: Map<string, Group>) => Group[]}
 */
const sorted = children => [...children.values()].sort((a, b) => {
  if (a.order === undefined || b.order === undefined) return a.order === b.order ? 0 : a.title.localeCompare(b.title);
  return a.order - b.order || a.title.localeCompare(b.title);
});
/** @type {(number: number) => string} */
const pad = number => String(number).padStart(2, "0");
/** @type {(at: Date) => string} */
const date = at => `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
/** @type {(text: unknown) => string} */
const escape = text => String(text).replace(/[&<>"']/g, character => `&#${character.charCodeAt(0)};`);

const STYLE = `
:root {
  color-scheme: light dark;
  --bg: #f7f7f5; --surface: #ffffff; --text: #1d1f23; --muted: #646a73; --border: #e2e4e8;
  --accent: #2f5bd3; --passed: #1a7f37; --failed: #c62828; --skipped: #8a8f98; --code-bg: #eef0f3; --failed-bg: #fdecec;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #131519; --surface: #1a1d22; --text: #e4e6ea; --muted: #9aa1ab; --border: #2b2f36;
    --accent: #7ea4ff; --passed: #3fb950; --failed: #ff7070; --skipped: #7d848e; --code-bg: #23272e; --failed-bg: #3a1d1f;
  }
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
html { scroll-padding-top: 64px; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
code, .path, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
code { font-size: .88em; background: var(--code-bg); padding: .05em .35em; border-radius: 4px; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.layout { display: grid; grid-template-columns: 290px minmax(0, 1fr); }
nav { position: sticky; top: 0; height: 100vh; overflow: auto; padding: 20px 16px; border-right: 1px solid var(--border); background: var(--surface); font-size: 14px; }
nav ul { list-style: none; margin: 0; padding: 0; }
nav ul ul { padding-left: 14px; }
nav li { margin: 3px 0; }
nav > ul > li { margin-top: 12px; }
nav > ul > li > a { font-weight: 600; color: var(--text); }
nav a.has-failures::before { content: "● "; color: var(--failed); }
.nav-home { display: block; font-weight: 700; color: var(--text); margin-bottom: 4px; }
main { padding: 28px 40px 80px; max-width: 1040px; min-width: 0; }
h1 { margin: 0 0 8px; font-size: 28px; letter-spacing: -.01em; }
.lead { margin: 0 0 16px; color: var(--muted); max-width: 70ch; }
.runs { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
.run { background: var(--surface); border: 1px solid var(--border); border-left: 4px solid var(--passed); border-radius: 8px; padding: 10px 14px; }
.run.has-failures { border-left-color: var(--failed); }
.run-title { font-weight: 600; }
.generated, .muted, .count, .path { color: var(--muted); }
.generated { font-size: 13px; margin: 10px 0 0; }
.toolbar { position: sticky; top: 0; z-index: 1; display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; margin: 20px 0 8px; padding: 10px 0; background: var(--bg); border-bottom: 1px solid var(--border); }
.toolbar input[type=search] { flex: 1 1 240px; min-width: 0; font: inherit; padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text); }
.toolbar label { display: flex; gap: 6px; align-items: center; white-space: nowrap; }
#shown { color: var(--muted); font-size: 13px; }
.note { color: var(--muted); }
.project { margin-top: 36px; }
h2 { font-size: 22px; margin: 0 0 8px; padding-bottom: 6px; border-bottom: 2px solid var(--border); }
h3, h4, h5 { display: inline; margin: 0; }
h3 { font-size: 18px; }
h4 { font-size: 16px; }
h5 { font-size: 15px; }
.count { font-size: 13px; font-weight: 400; }
.failed-count { color: var(--failed); font-weight: 600; }
details.group { margin: 10px 0; }
details.group > summary { cursor: pointer; padding: 4px 0; }
details.level-3 > summary { padding: 8px 0 4px; }
.group-body { padding-left: 18px; border-left: 1px solid var(--border); margin-left: 5px; }
.element { margin: 12px 0 18px; }
.element-title { margin-bottom: 4px; }
.element-title code { font-size: 14px; font-weight: 600; }
.file { margin: 6px 0 10px; }
.path { font-size: 12px; overflow-wrap: anywhere; }
.describe { margin: 6px 0 6px; }
.describe-body { padding-left: 16px; }
.describe-title { font-weight: 600; }
ul.tests { list-style: none; margin: 2px 0 6px; padding: 0; }
li.test { display: grid; grid-template-columns: 1.3em minmax(0, 1fr); gap: 2px; padding: 1px 0; }
.mark { font-weight: 700; text-align: center; }
.passed .mark { color: var(--passed); }
.failed .mark, .failed .name { color: var(--failed); }
.skipped .mark, .skipped .name { color: var(--skipped); }
.name { display: block; overflow-wrap: anywhere; }
.name::first-letter { text-transform: uppercase; }
.steps > span { display: block; }
pre.error { margin: 4px 0 8px; padding: 8px 10px; background: var(--failed-bg); border-radius: 6px; font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
@media (max-width: 820px) {
  html { scroll-padding-top: 104px; }
  .layout { grid-template-columns: 1fr; }
  nav { position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--border); padding: 16px; }
  main { padding: 16px 16px 64px; }
  .group-body { padding-left: 10px; }
}
`;

const SCRIPT = `
const search = document.getElementById("search");
const failures = document.getElementById("failures");
const shown = document.getElementById("shown");
const nothing = document.getElementById("nothing");
const tests = [...document.querySelectorAll("li.test")];
const groups = [...document.querySelectorAll("[data-group]")];
function apply() {
  const words = search.value.toLowerCase().split(/\\s+/).filter(Boolean);
  let count = 0;
  for (const test of tests) {
    test.hidden = (failures.checked && !test.classList.contains("failed")) || !words.every(word => test.dataset.search.includes(word));
    if (!test.hidden) count++;
  }
  for (const group of groups) group.hidden = !group.querySelector("li.test:not([hidden])");
  if (words.length || failures.checked) for (const details of document.querySelectorAll("details")) details.open = true;
  shown.textContent = count === tests.length ? tests.length + " tests" : count + " of " + tests.length + " tests";
  nothing.hidden = count > 0;
}
search.addEventListener("input", apply);
failures.addEventListener("change", apply);
apply();
`;
