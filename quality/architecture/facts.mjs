/**
 * What the rules read in a file. An adapter parses the file, then gives its tree to factsOf: the tree of oxc (ESTree) for
 * TypeScript, the tree of Babel for Marko. The two trees differ in a few names only, so one walk reads both.
 */

/**
 * A node of the tree of oxc or of Babel. The nodes have many shapes, and the walk reads the fields of the two trees: they have no type.
 * @typedef {any} Node
 */
/** @typedef {{ name: string | null; kind: string }} Export an exported name, and its kind */
/** @typedef {{ name: string | null; readonly: boolean; value: string | null; asConst: boolean }} Property a property of a class */
/** @typedef {{ name: string | null; exported: boolean; extends: string | null; implements: string[]; properties: Property[] }} Class */
/** @typedef {{ chain: string[]; source: string }} Item an item of `export default [ … ]` */
/** @typedef {{ name: string | null; args: (string | null)[] }} Call */
/**
 * What the rules read in a file: see factsOf.
 * @typedef {{
 *   imports: string[]; exports: Export[]; defaultArray: Item[] | null; classes: Class[]; constructed: (string | null)[]; calls: Call[];
 *   objectTypes: string[]; strings: string[]; tags: string[]
 * }} Facts
 */

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
 * @param {Node} node
 * @returns {Export[]}
 */
function exportsOf(node) {
  if (node.type === "ExportDefaultDeclaration") return [{ name: "default", kind: "default" }];
  if (node.type === "ExportAllDeclaration") return [{ name: node.exported ? nameOf(node.exported) ?? stringOf(node.exported) : "*", kind: "all" }];
  const { declaration } = node;
  if (!declaration) return node.specifiers.map((/** @type {Node} */ specifier) => ({ name: nameOf(specifier.exported) ?? stringOf(specifier.exported), kind: "specifier" }));
  if (declaration.type === "VariableDeclaration") return declaration.declarations.map((/** @type {Node} */ declarator) => ({ name: declarator.id.name, kind: declaration.kind }));
  return [{ name: declaration.id?.name, kind: DECLARATION_KINDS[declaration.type] ?? declaration.type }];
}

/** @type {(node: Node, exported: boolean) => Class} */
const classOf = (node, exported) => ({
  name: node.id?.name ?? null,
  exported,
  extends: nameOf(node.superClass),
  implements: (node.implements ?? []).map((/** @type {Node} */ heritage) => nameOf(heritage.expression)).filter(Boolean),
  properties: node.body.body.filter((/** @type {Node} */ member) => member.type === "PropertyDefinition" || member.type === "ClassProperty").map((/** @type {Node} */ member) => ({
    name: keyOf(member),
    readonly: Boolean(member.readonly),
    value: stringOf(member.value),
    asConst: member.value?.type === "TSAsExpression" && member.value.typeAnnotation?.typeName?.name === "const"
  }))
});

/**
 * - imports: every module the file imports or re-exports, dynamic imports included;
 * - exports: each exported name, with its kind (class, interface, type, const, function, enum, specifier, default, all);
 * - defaultArray: the items of `export default [ … ]`, with the calls of each item (`bind(X).to(Y)` calls bind, to), or null;
 * - classes: the classes, with what they extend and implement, and their properties;
 * - constructed: the class of each `new X(…)`;
 * - calls: each call, with the value of its arguments that are strings (null for the others);
 * - objectTypes: the value of each `type: "…"` of an object literal;
 * - strings: every string of the code (comments and import paths aside);
 * - tags: the name of each Marko tag (Marko only).
 * @param {Node} program
 * @param {string} text
 * @returns {Facts}
 */
export function factsOf(program, text) {
  /** @type {Facts} */
  const facts = { imports: [], exports: [], defaultArray: null, classes: [], constructed: [], calls: [], objectTypes: [], strings: [], tags: [] };
  const exportedClasses = new WeakSet();
  const seen = new WeakSet();

  /** @param {Node} node */
  const visit = node => {
    if (WITH_SOURCE.has(node.type)) {
      const source = stringOf(node.source);
      if (source !== null) facts.imports.push(source);
    }
    if (node.type === "TSImportType") {
      const source = stringOf(node.source ?? node.argument);
      if (source !== null) facts.imports.push(source);
    }
    if (node.type === "CallExpression" && node.callee.type === "Import") {
      const source = stringOf(node.arguments[0]);
      if (source !== null) facts.imports.push(source);
    }
    if (node.type === "ExportNamedDeclaration" || node.type === "ExportDefaultDeclaration" || node.type === "ExportAllDeclaration") {
      facts.exports.push(...exportsOf(node));
      if (node.declaration?.type === "ClassDeclaration") exportedClasses.add(node.declaration);
      if (node.type === "ExportDefaultDeclaration" && node.declaration.type === "ArrayExpression") {
        facts.defaultArray = node.declaration.elements.map((/** @type {Node} */ item) => ({ chain: chainOf(item), source: item ? text.slice(item.start, item.end).replace(/\s+/g, " ") : "" }));
      }
    }
    if (node.type === "ClassDeclaration") facts.classes.push(classOf(node, exportedClasses.has(node)));
    if (node.type === "NewExpression") facts.constructed.push(nameOf(node.callee));
    if (node.type === "CallExpression") facts.calls.push({ name: nameOf(node.callee), args: node.arguments.map(stringOf) });
    if (node.type === "ObjectExpression") {
      for (const property of node.properties) {
        const type = stringOf(property.value);
        if ((property.type === "Property" || property.type === "ObjectProperty") && !property.computed && keyOf(property) === "type" && type !== null) {
          facts.objectTypes.push(type);
        }
      }
    }
    if ((node.type === "Literal" || node.type === "StringLiteral") && typeof node.value === "string") facts.strings.push(node.value);
    if (node.type === "TemplateElement") facts.strings.push(node.value.cooked);
    const tag = node.type === "MarkoTag" ? stringOf(node.name) : null;
    if (tag !== null) facts.tags.push(tag);
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
