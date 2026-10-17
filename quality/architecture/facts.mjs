/**
 * What the rules read in a file. An adapter parses the file, then gives its tree to factsOf: the tree of oxc (ESTree) for
 * TypeScript, the tree of Babel for Marko. The two trees differ in a few names only, so one walk reads both.
 */

/**
 * A node of the tree of oxc or of Babel. The nodes have many shapes, and the walk reads the fields of the two trees: they have no type.
 * @typedef {any} Node
 */
/** Each fact that a rule points at has the number of its line in the file, from 1. */
/** @typedef {{ name: string | null; kind: string; line: number }} Export an exported name, its kind, and its line */
/** @typedef {{ name: string | null; readonly: boolean; value: string | null; asConst: boolean; line: number }} Property a property of a class */
/** @typedef {{ name: string | null; exported: boolean; extends: string | null; implements: string[]; properties: Property[]; line: number }} Class */
/**
 * An item of `export default [ … ]`: the names that its chain calls, its text, the name that the first call takes first (`when(Event, …)`
 * takes Event), the class of each `new X(…)` in it, and its line.
 * @typedef {{ chain: string[]; source: string; subject: string | null; constructed: (string | null)[]; line: number }} Item
 */
/** @typedef {{ name: string; from: string; line: number }} Imported a name that the file imports, the module it comes from, and its line */
/**
 * A call: the name that it calls, the name that its chain starts from (`test` for `test.skip(…)`), its arguments that are strings, and its
 * line.
 * @typedef {{ name: string | null; root: string | null; args: (string | null)[]; line: number }} Call
 */
/**
 * The lines of the facts that are strings, in the same order: `lines.imports[2]` is the line of `imports[2]`. A tag that Marko finds
 * without an import counts as an import, at the line of the tag.
 * @typedef {{ imports: number[]; constructed: number[]; objectTypes: number[]; tags: number[]; comments: number[] }} Lines
 */
/**
 * What the rules read in a file: see factsOf.
 * @typedef {{
 *   imports: string[]; imported: Imported[]; exports: Export[]; defaultArray: Item[] | null; classes: Class[]; constructed: (string | null)[];
 *   calls: Call[]; objectTypes: string[]; strings: string[]; tags: string[]; comments: string[]; lines: Lines
 * }} Facts
 */
/** A comment that a parser gives apart from the tree: its text, and where it starts in the file. @typedef {{ value: string; start: number }} LooseComment */

/**
 * The number of the line (from 1) of a place in a text, from where the text starts: the offset of a node, or of a match.
 * @param {string} text
 * @returns {(offset: number) => number}
 */
export function linesIn(text) {
  /** @type {number[]} */
  const starts = [0];
  for (let index = text.indexOf("\n"); index !== -1; index = text.indexOf("\n", index + 1)) starts.push(index + 1);
  return offset => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (starts[middle] <= offset) low = middle; else high = middle - 1;
    }
    return low + 1;
  };
}

const SKIPPED_KEYS = new Set(["loc", "range", "start", "end", "extra", "leadingComments", "innerComments", "trailingComments", "comments"]);
const WITH_SOURCE = new Set(["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration", "ImportExpression"]);
/** @type {Record<string, string>} */
const DECLARATION_KINDS = { ClassDeclaration: "class", FunctionDeclaration: "function", TSInterfaceDeclaration: "interface", TSTypeAliasDeclaration: "type", TSEnumDeclaration: "enum" };

/** @type {(node: Node) => string | null} */
const stringOf = node => {
  if ((node?.type === "Literal" || node?.type === "StringLiteral") && typeof node.value === "string") return node.value;
  if (node?.type === "TemplateLiteral" && node.expressions.length === 0) return node.quasis[0].value.cooked;
  if (node?.type === "TSAsExpression" || node?.type === "TSLiteralType") return stringOf(node.expression ?? node.literal);
  return null;
};
/** @type {(node: Node) => string | null} */
const nameOf = node => node?.type === "Identifier" ? node.name : node?.type === "MemberExpression" && !node.computed ? node.property.name : null;
/** The name that a callee starts from: `test` for `test.skip`, `test.skipIf(x)` and `test.describe.only`. @type {(node: Node) => string | null} */
const rootOf = node => {
  while (node?.type === "MemberExpression" || node?.type === "CallExpression") node = node.type === "MemberExpression" ? node.object : node.callee;
  return node?.type === "Identifier" ? node.name : null;
};
/** @type {(node: Node) => string | null} */
const keyOf = node => node.key?.name ?? stringOf(node.key);

/**
 * The names a call chain calls, from the first: `bind(X).to(Y).with(z)` calls bind, to, with.
 * @param {Node} node
 * @returns {string[]}
 */
function chainOf(node) {
  /** @type {string[]} */
  const names = [];
  while (node?.type === "CallExpression") {
    if (node.callee.type === "Identifier") return [node.callee.name, ...names];
    if (node.callee.type !== "MemberExpression" || node.callee.computed) return [];
    names.unshift(node.callee.property.name);
    node = node.callee.object;
  }
  return [];
}

/**
 * The name that the first call of a chain takes first: `when(Event, …)` and `bind(Port).to(Adapter)` take Event and Port.
 * @param {Node} node
 * @returns {string | null}
 */
function subjectOf(node) {
  while (node?.type === "CallExpression" && node.callee.type === "MemberExpression") node = node.callee.object;
  return node?.type === "CallExpression" && node.arguments[0]?.type === "Identifier" ? node.arguments[0].name : null;
}

/**
 * @param {Node} node
 * @param {(node: Node) => number} lineOf
 * @returns {Export[]}
 */
function exportsOf(node, lineOf) {
  const line = lineOf(node);
  if (node.type === "ExportDefaultDeclaration") return [{ name: "default", kind: "default", line }];
  if (node.type === "ExportAllDeclaration") return [{ name: node.exported ? nameOf(node.exported) ?? stringOf(node.exported) : "*", kind: "all", line }];
  const { declaration } = node;
  if (!declaration) return node.specifiers.map((/** @type {Node} */ specifier) => ({ name: nameOf(specifier.exported) ?? stringOf(specifier.exported), kind: "specifier", line: lineOf(specifier) }));
  if (declaration.type === "VariableDeclaration") return declaration.declarations.map((/** @type {Node} */ declarator) => ({ name: declarator.id.name, kind: declaration.kind, line: lineOf(declarator) }));
  return [{ name: declaration.id?.name, kind: DECLARATION_KINDS[declaration.type] ?? declaration.type, line }];
}

/** @type {(node: Node, exported: boolean, lineOf: (node: Node) => number) => Class} */
const classOf = (node, exported, lineOf) => ({
  name: node.id?.name ?? null,
  exported,
  extends: nameOf(node.superClass),
  implements: (node.implements ?? []).map((/** @type {Node} */ heritage) => nameOf(heritage.expression)).filter(Boolean),
  properties: node.body.body.filter((/** @type {Node} */ member) => member.type === "PropertyDefinition" || member.type === "ClassProperty").map((/** @type {Node} */ member) => ({
    name: keyOf(member),
    readonly: Boolean(member.readonly),
    value: stringOf(member.value),
    asConst: member.value?.type === "TSAsExpression" && member.value.typeAnnotation?.typeName?.name === "const",
    line: lineOf(member)
  })),
  line: lineOf(node)
});

/**
 * - imports: every module the file imports or re-exports, dynamic imports included;
 * - imported: each name that the file imports, with its module;
 * - exports: each exported name, with its kind (class, interface, type, const, function, enum, specifier, default, all);
 * - defaultArray: the items of `export default [ … ]`, with the calls of each item (`bind(X).to(Y)` calls bind, to), the name that the first
 *   call takes first (X), and the classes that the item builds, or null;
 * - classes: the classes, with what they extend and implement, and their properties;
 * - constructed: the class of each `new X(…)`;
 * - calls: each call, with the value of its arguments that are strings (null for the others);
 * - objectTypes: the value of each `type: "…"` of an object literal;
 * - strings: every string of the code (comments and import paths aside);
 * - tags: the name of each Marko tag (Marko only);
 * - comments: the text of each comment: those that the parser gives, those that the tree holds, and the comments of a Marko template;
 * - lines: the line of each import, `new`, `type: "…"`, tag and comment. The facts that are objects have their own line.
 * A node of oxc has its offset in the text (start); a node of Babel has its line too (loc), which counts from the first line of the file.
 * @param {Node} program
 * @param {string} text
 * @param {LooseComment[]} [comments] the comments that the parser gives apart from the tree (oxc)
 * @returns {Facts}
 */
export function factsOf(program, text, comments = []) {
  const lineAt = linesIn(text);
  /** @type {(node: Node) => number} */
  const lineOf = node => node.loc?.start?.line ?? lineAt(node.start ?? 0);
  /** @type {Facts} */
  const facts = {
    imports: [], imported: [], exports: [], defaultArray: null, classes: [], constructed: [], calls: [], objectTypes: [], strings: [], tags: [],
    comments: comments.map(({ value }) => value),
    lines: { imports: [], constructed: [], objectTypes: [], tags: [], comments: comments.map(({ start }) => lineAt(start)) }
  };
  /** @type {(source: string, node: Node) => void} */
  const addImport = (source, node) => {
    facts.imports.push(source);
    facts.lines.imports.push(lineOf(node));
  };
  const seenComments = new WeakSet();
  const exportedClasses = new WeakSet();
  const seen = new WeakSet();
  /** @type {{ node: Node; item: Item }[]} */
  const items = [];

  /** @param {Node} node */
  const visit = node => {
    if (WITH_SOURCE.has(node.type)) {
      const source = stringOf(node.source);
      if (source !== null) addImport(source, node);
      if (source !== null && node.type === "ImportDeclaration") {
        for (const specifier of node.specifiers) facts.imported.push({ name: specifier.local.name, from: source, line: lineOf(specifier) });
      }
    }
    if (node.type === "TSImportType") {
      const source = stringOf(node.source ?? node.argument);
      if (source !== null) addImport(source, node);
    }
    if (node.type === "CallExpression" && node.callee.type === "Import") {
      const source = stringOf(node.arguments[0]);
      if (source !== null) addImport(source, node);
    }
    if (node.type === "ExportNamedDeclaration" || node.type === "ExportDefaultDeclaration" || node.type === "ExportAllDeclaration") {
      facts.exports.push(...exportsOf(node, lineOf));
      if (node.declaration?.type === "ClassDeclaration") exportedClasses.add(node.declaration);
      if (node.type === "ExportDefaultDeclaration" && node.declaration.type === "ArrayExpression") {
        facts.defaultArray = node.declaration.elements.map((/** @type {Node} */ element) => {
          /** @type {Item} */
          const item = {
            chain: chainOf(element), source: element ? text.slice(element.start, element.end).replace(/\s+/g, " ") : "", subject: subjectOf(element), constructed: [],
            line: lineOf(element ?? node)
          };
          if (element) items.push({ node: element, item });
          return item;
        });
      }
    }
    if (node.type === "ClassDeclaration") facts.classes.push(classOf(node, exportedClasses.has(node), lineOf));
    if (node.type === "NewExpression") {
      facts.constructed.push(nameOf(node.callee));
      facts.lines.constructed.push(lineOf(node));
      for (const { node: element, item } of items) if (element.start <= node.start && node.end <= element.end) item.constructed.push(nameOf(node.callee));
    }
    if (node.type === "CallExpression") facts.calls.push({ name: nameOf(node.callee), root: rootOf(node.callee), args: node.arguments.map(stringOf), line: lineOf(node) });
    if (node.type === "ObjectExpression") {
      for (const property of node.properties) {
        const type = stringOf(property.value);
        if ((property.type === "Property" || property.type === "ObjectProperty") && !property.computed && keyOf(property) === "type" && type !== null) {
          facts.objectTypes.push(type);
          facts.lines.objectTypes.push(lineOf(node));
        }
      }
    }
    if ((node.type === "Literal" || node.type === "StringLiteral") && typeof node.value === "string") facts.strings.push(node.value);
    if (node.type === "TemplateElement") facts.strings.push(node.value.cooked);
    const tag = node.type === "MarkoTag" ? stringOf(node.name) : null;
    if (tag !== null) {
      facts.tags.push(tag);
      facts.lines.tags.push(lineOf(node));
    }
    // Babel hangs the comments on the nodes next to them, a comment on two nodes at times; a comment of a Marko template is a node.
    for (const comment of [node.leadingComments, node.innerComments, node.trailingComments].flat()) {
      if (comment && !seenComments.has(comment)) {
        seenComments.add(comment);
        facts.comments.push(comment.value);
        facts.lines.comments.push(lineOf(comment));
      }
    }
    if (node.type === "MarkoComment") {
      facts.comments.push(node.value);
      facts.lines.comments.push(lineOf(node));
    }
  };

  /** @type {(node: Node, parentType?: string, key?: string) => void} */
  const walk = (node, parentType = "", key = "") => {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) walk(item, parentType, key);
      return;
    }
    if (key === "source" && WITH_SOURCE.has(parentType)) return;
    if (typeof node.type === "string") visit(node);
    for (const [childKey, child] of Object.entries(node)) {
      if (!SKIPPED_KEYS.has(childKey)) walk(child, node.type, childKey);
    }
  };

  walk(program);
  return facts;
}
