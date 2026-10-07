import type { ESTree } from "vite";

/** Reads a module of TypeScript as a program: the parser of Vite (oxc) in the build, and in the tests. */
export type Parse = (filename: string, code: string) => { program: ESTree.Program };

/**
 * The code that a module needs after its own, for the containers:
 * - after each class that has a constructor, the dependencies of the constructor (DEPENDENCIES in Container.ts): the name of each
 *   parameter, if it is optional, and the token of its type when the type has a value of the same name, declared in the module or
 *   imported from a relative path, from a shortcut of the project (#…, which a package.json or a tsconfig.json maps to a folder) or from
 *   one of the packages given (a port and its token, or a class: the kernel gives EventPublisher, DataDirectory…). The token is read only
 *   when the container needs it, thus a cycle between modules does no harm. The name of the type goes with its token, for the errors;
 * - the name of each token declared without one: the name of its constant.
 * The names are text: the minifier can rename the code.
 */
export function declareDependencies(code: string, filename: string, parse: Parse, packages: readonly string[]): string | undefined {
  const { program } = parse(filename, code);
  const imported = new Map<string, { source: string; name: string }>();
  const values = new Set<string>();
  const classes: { name: string; parameters: readonly ESTree.ParamPattern[] }[] = [];
  const tokens: string[] = [];

  for (const statement of program.body) {
    if (statement.type === "ImportDeclaration") {
      const source = statement.source.value;
      if (!source.startsWith(".") && !source.startsWith("#") && !packages.some(name => source === name || source.startsWith(`${name}/`))) continue;
      for (const specifier of statement.specifiers) {
        if (specifier.type === "ImportSpecifier") imported.set(specifier.local.name, { source, name: nameOf(specifier.imported) });
        if (specifier.type === "ImportDefaultSpecifier") imported.set(specifier.local.name, { source, name: "default" });
      }
      continue;
    }
    const declaration = statement.type === "ExportNamedDeclaration" || statement.type === "ExportDefaultDeclaration" ? statement.declaration : statement;
    if (declaration?.type === "VariableDeclaration") {
      for (const { id, init } of declaration.declarations) {
        if (id.type !== "Identifier") continue;
        values.add(id.name);
        if (init?.type === "NewExpression" && init.callee.type === "Identifier" && init.callee.name === "Token" && init.arguments.length === 0) tokens.push(id.name);
      }
    }
    if ((declaration?.type === "FunctionDeclaration" || declaration?.type === "TSEnumDeclaration") && declaration.id) values.add(declaration.id.name);
    if (declaration?.type === "ClassDeclaration" && declaration.id) {
      values.add(declaration.id.name);
      const constructor = declaration.body.body.find(member => member.type === "MethodDefinition" && member.kind === "constructor");
      if (constructor?.type === "MethodDefinition") classes.push({ name: declaration.id.name, parameters: constructor.value.params });
    }
  }
  if (classes.length === 0 && tokens.length === 0) return undefined;

  const namespaces = new Map<string, string>();
  const tokenOf = (type: ESTree.TSType | undefined): { type: string; token: string } | undefined => {
    if (type?.type !== "TSTypeReference" || type.typeName.type !== "Identifier") return undefined;
    const name = type.typeName.name;
    if (values.has(name)) return { type: name, token: name };
    const from = imported.get(name);
    if (!from) return undefined;
    if (!namespaces.has(from.source)) namespaces.set(from.source, `__dependencies_${namespaces.size}`);
    return { type: name, token: `${namespaces.get(from.source)}[${JSON.stringify(from.name)}]` };
  };
  const dependencyOf = (parameter: ESTree.ParamPattern, index: number): string => {
    const inner = parameter.type === "TSParameterProperty" ? parameter.parameter : parameter;
    const pattern = inner.type === "AssignmentPattern" ? inner.left : inner;
    const name = pattern.type === "Identifier" ? pattern.name : `#${index}`;
    const typed = tokenOf(pattern.typeAnnotation?.typeAnnotation);
    const optional = inner.type === "AssignmentPattern" || pattern.optional === true;
    return `{ name: ${JSON.stringify(name)}${typed ? `, type: ${JSON.stringify(typed.type)}, token: () => ${typed.token}` : ""}${optional ? ", optional: true" : ""} }`;
  };

  const declarations = classes.map(({ name, parameters }) => `${name}[Symbol.for("kernel.dependencies")] = [${parameters.map(dependencyOf).join(", ")}];`);
  const imports = [...namespaces].map(([source, alias]) => `import * as ${alias} from ${JSON.stringify(source)};`);
  const names = tokens.map(name => `${name}.name = ${JSON.stringify(name)};`);
  return [...imports, ...declarations, ...names].join("\n");
}

const nameOf = (name: ESTree.ModuleExportName): string => name.type === "Literal" ? name.value : name.name;
