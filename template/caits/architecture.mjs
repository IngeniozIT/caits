import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  adapterOf, contextFolderOf, frontendCallsOf, givesSharedTags, importedModules, isListed, isMarko, isPackage, isTestCode, kebab, kernelPathOf,
  LISTS, linesOf, locate, portOf, resolveImport, typeOfEvent
} from "@ingenioz-it/caits/quality/architecture";

/** @import { File, Located, Location, Rule } from "@ingenioz-it/caits/quality/architecture" */

/**
 * The rules of the architecture, by layer. Each rule has a name and a description, reads one kind of thing (`on`), and checks it:
 * the check gives nothing when the rule holds, else what is wrong and how to fix it, as a message or a list of messages. A message is a
 * text, or `{ line, message }` when the rule points at one construct of the file (an import, an export, a class, a call…).
 * - on "import": each import of the production code, as { file, from, to, specifier, internal, target, line } (from and to: see locate),
 *   with the project. The message of an import is at its line. The rules on imports do not overlap: an import breaks two of them only
 *   when it has two problems.
 * - on "file": each file, with the project ({ root, files, paths, packages }); `production: true` leaves the test code aside.
 * - on "project": the project once; the check gives a list of { file, line?, message }.
 * The packages of the project are the lists of quality/imports.mjs: the packages that each layer may import.
 */

/** The name of a file, without its folder. @type {(path: string) => string} */
const fileName = path => path.slice(path.lastIndexOf("/") + 1);
/** The folder of a file. @type {(path: string) => string} */
const folderOf = path => path.slice(0, path.lastIndexOf("/"));
/** A name in PascalCase, from kebab-case, camelCase, snake_case or dots: message-board and messageBoard give MessageBoard. @type {(name: string) => string} */
const pascalOf = name => name.split(/[^A-Za-z0-9]+/).filter(Boolean).map(word => word[0].toUpperCase() + word.slice(1)).join("");
/** A name in camelCase: messages gives messages, user-profiles gives userProfiles. @type {(name: string) => string} */
const camelOf = name => pascalOf(name).replace(/^./, first => first.toLowerCase());
/** Names in a sentence: a, b and c. @type {(items: string[], last?: string) => string} */
const listOf = (items, last = "and") => items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} ${last} ${items[items.length - 1]}`;
/** A message at a line of the file. @type {(line: number, message: string) => Located} */
const at = (line, message) => ({ line, message });
/** What a file exports, in a sentence: `exports Text as a type`. @type {(kind: string) => string} */
const kindOf = kind => ({ interface: "an interface", type: "a type", function: "a function", const: "a constant", let: "a variable", var: "a variable", enum: "an enum", specifier: "a name of a list", default: "a default export" })[kind] ?? `a ${kind}`;
/** A layer that does something, in a sentence: The domain, This di.ts, The context map. @type {(layer: string) => string} */
const subjectOf = layer => layer === "di" ? "This di.ts" : layer === "map" ? "The context map" : `The ${layer}`;
/** A layer that gets something, in a sentence: the domain, di.ts, the context map. @type {(layer: string) => string} */
const objectOf = layer => layer === "di" ? "di.ts" : layer === "map" ? "the context map" : `the ${layer}`;
/** What a file of the project is, in a sentence, from its path: a handler, a view, an adapter… @type {(target: string) => string} */
const fileKindOf = target =>
  /\.handler\.(js|ts)$/.test(target) ? "a handler"
  : /\.controller\.(js|ts)$/.test(target) ? "a controller"
  : /\.dto\.(js|ts)$/.test(target) ? "an input DTO"
  : /\/presentation\/view\//.test(target) ? "a view"
  : /\/presentation\/component\//.test(target) ? "a component"
  : /\/presentation\/store\//.test(target) ? "the store"
  : /\/infra\//.test(target) ? "an adapter"
  : /\/(test\.)?di\.(js|ts)$/.test(target) ? "a di.ts"
  : `a file of ${objectOf(locate(target).layer ?? "project")}`;
/**
 * An import from a layer of a context to a layer of its context, or of the context shared of its side: the rules on the layers read it.
 * An import of a di.ts is for di-read-by-kernel, an import of another context for contexts-isolated.
 * @type {(from: Location, to: Location) => boolean}
 */
const withinContext = (from, to) => from.kind === "layer" && to.kind === "layer" && to.side === from.side && to.layer !== "di"
  && (to.context === from.context || to.context === "shared");
/**
 * The name of a port: the interface that its module exports, or the name of its file when the module exports none yet.
 * @type {(module: string, files: File[]) => string}
 */
const portNameOf = (module, files) => files.find(file => file.path === `${module}.ts`)?.exports.find(({ kind }) => kind === "interface")?.name ?? fileName(module);
/**
 * The port of an adapter, from the path of the adapter: its name and its path, when the domain declares it.
 * @type {(target: string, project: { paths: Set<string>; files: File[] }) => { name: string; path: string } | null}
 */
const portOfAdapter = (target, { paths, files }) => {
  const module = adapterOf(target, paths)?.portModule;
  return module ? { name: portNameOf(module, files), path: `${module}.ts` } : null;
};
/**
 * The names that a file imports from a module of the project, without its extension: `implements NoteRepository` names the port when
 * NoteRepository comes from the module of the port.
 * @type {(file: File, module: string, root: string) => Set<string>}
 */
const namesFrom = (file, module, root) => new Set(file.imported
  .filter(({ from }) => resolveImport(file.path, from, root).target.replace(/\.(js|ts)$/, "") === module).map(({ name }) => name));
/**
 * The port folder of the domain that a class implements, through the module that the file imports its interface from.
 * @type {(file: File, root: string) => { implementer: string; name: string; folder: string } | undefined}
 */
const implementedPortOf = (file, root) => file.classes.flatMap(declared => declared.implements.flatMap(name => {
  const from = file.imported.find(imported => imported.name === name)?.from;
  const port = from === undefined ? null : portOf(`${resolveImport(file.path, from, root).target.replace(/\.(js|ts)$/, "")}.ts`);
  return port && !port.contract ? [{ implementer: declared.name ?? "Its class", name, folder: port.folder }] : [];
}))[0];
/**
 * The file that an import of a stylesheet loads: Sass adds the extension, and the _ of a partial.
 * @type {(target: string, paths: Set<string>) => string}
 */
const stylesheetOf = (target, paths) => {
  const partial = `${folderOf(target)}/_${fileName(target)}`;
  return [target, `${target}.scss`, `${partial}.scss`, `${target}.css`, `${target}/_index.scss`, `${target}/index.scss`].find(path => paths.has(path)) ?? target;
};
/**
 * The shortcut that leads a file to the target of its import, if one does: #context/ in its context, #shared/ or #frontend-shared/ for
 * the context shared of its side, #backend/ or #frontend/ from a route.
 * @type {(path: string, target: string) => string | undefined}
 */
const shortcutOf = (path, target) => {
  const where = locate(path);
  if (where.kind === "routes") {
    const [, side, rest] = /^src\/(backend|frontend)\/(.+)$/.exec(target) ?? [];
    return side ? `#${side}/${rest}` : undefined;
  }
  const context = contextFolderOf(path);
  if (context && target.startsWith(`${context}/`)) return `#context/${target.slice(context.length + 1)}`;
  if (where.kind === "layer" && target.startsWith(`src/${where.side}/shared/`)) {
    return `${where.side === "backend" ? "#shared" : "#frontend-shared"}/${target.slice(`src/${where.side}/shared/`.length)}`;
  }
  return undefined;
};

/**
 * What a file of command/ or query/ breaks when it is not a file of a use case, or nothing. A use case holds its files in its folder, each
 * named after the use case: the DTOs, the handler and its test, and in the backend the controllers and their tests.
 * @param {string} path
 * @param {"backend" | "frontend"} side
 * @param {Set<string>} paths
 */
function useCaseShape(path, side, paths) {
  const [, context, kind, rest] = /^(src\/(?:backend|frontend)\/[^/]+)\/(command|query)\/(.+)$/.exec(path) ?? [];
  const name = fileName(path);
  const parts = rest.split("/");
  if (parts.length === 1) {
    return `${name} is in ${kind}/ but in no folder of a use case: ${kind}/ holds one folder per use case. Move it to ${context}/${kind}/${name.split(".")[0]}/${name}.`;
  }
  const [useCase] = parts;
  const suffix = name.slice(name.indexOf("."));
  const shapes = side === "backend" ? /^\.(handler|dto|application\.test|[a-z0-9-]+\.(controller|presentation\.test))\.ts$/ : /^\.(handler|dto|application\.test)\.ts$/;
  if (parts.length === 2 && shapes.test(suffix)) return `${name} does not start with the name of its use case, ${useCase}. Rename it ${useCase}${suffix}.`;
  if (parts.length === 2 && name.endsWith(".test.ts")) {
    const controllers = [...paths].sort().flatMap(other => new RegExp(`^${context}/${kind}/${useCase}/${useCase}\\.([a-z0-9-]+)\\.controller\\.ts$`).exec(other)?.[1] ?? []);
    const presentation = side === "frontend" ? ""
      : controllers.length === 0 ? `, or ${useCase}.{name}.presentation.test.ts if it tests the controller ${useCase}.{name}.controller.ts`
      : controllers.map(controller => `, or ${useCase}.${controller}.presentation.test.ts if it tests the controller ${useCase}.${controller}.controller.ts`).join("");
    return `${name} is a test of the use case ${useCase}, but its name does not say the layer that it tests. Rename it ${useCase}.application.test.ts${side === "backend" ? " if it tests the handler" : ""}${presentation}.`;
  }
  const controllers = side === "backend" ? `, and its controllers ${useCase}.{name}.controller.ts, each with its test ${useCase}.{name}.presentation.test.ts` : "";
  return `${name} is not a file of a use case: ${kind}/${useCase}/ holds ${useCase}.dto.ts, ${useCase}.handler.ts and ${useCase}.application.test.ts${controllers}. Move its code into ${useCase}.handler.ts, or into ${context}/domain/ if another use case needs it.`;
}

/**
 * The rule of the list of a layer in quality/imports.mjs, for the layers whose import of a package needs no fix of its own: the layer
 * imports only the packages of its list. Without a list, the rule never fires.
 * @param {"presentation" | "infra" | "di" | "map"} layer
 * @returns {Rule}
 */
function listedPackages(layer) {
  const subject = { presentation: "The presentation layer", infra: "The infra layer", di: "This di.ts", map: "The context map" }[layer];
  const key = LISTS[layer];
  return {
    name: `${layer === "map" ? "context-map" : layer}-imports-only-listed-packages`,
    description: `${subject.replace(/^This/, "A")} imports only the packages, the modules of the kernel and the Node APIs that quality/imports.mjs lists for it, under ${key}. CAITS gives it no list: it imports any package, until the project gives it one.`,
    on: "import",
    check: ({ from, specifier, internal }, { packages }) => {
      const list = packages[key];
      if (internal || from.kind !== "layer" || from.layer !== layer || !list || isListed(specifier, list)) return;
      const where = layer === "presentation" || layer === "infra" ? `the ${layer}` : key;
      return `${subject} imports ${specifier}, ${specifier.startsWith("node:") ? "a Node API" : "a package"} that quality/imports.mjs does not list for ${objectOf(layer)}. Add it to ${where} in quality/imports.mjs, or move the code that needs it to a layer whose list holds it.`;
    }
  };
}

/** @type {Rule[]} */
export const rules = [
  // Kernel: the package @ingenioz-it/caits builds the containers and the controllers

  {
    name: "container-built-by-kernel",
    description: "Only the kernel makes a Container. A context does not build its dependencies: its di.ts gives the bindings, and the kernel builds them.",
    on: "file",
    check: ({ path, constructed, lines }) => {
      const context = contextFolderOf(path);
      return constructed.flatMap((name, index) => name !== "Container" ? [] : [at(lines.constructed[index],
        `This file builds a Container, but only the kernel builds the containers, from the di.ts of each context. Remove \`new Container(…)\`, and bind what it holds in ${context ? `${context}/di.ts` : "the di.ts of the context that uses it"}.`)]);
    }
  },
  {
    name: "controllers-built-by-kernel",
    description: "Only the kernel makes a controller, with its dependencies. The other code asks the kernel for a controller, or sends a request through the router.",
    on: "file",
    check: ({ path, constructed, lines }) => {
      const route = locate(path).kind === "routes";
      return constructed.flatMap((name, index) => name === null || !/^[A-Z]\w*Controller$/.test(name) ? [] : [at(lines.constructed[index],
        `This file builds ${name} with \`new\`, but only the kernel builds a controller, with its dependencies. ${route ? `Ask the kernel for it with \`controller(${name})\`, from @ingenioz-it/caits/di/backend.` : "Send the request through the router instead."}`)]);
    }
  },

  // Domain: entities, value objects, errors, events and ports

  {
    name: "domain-shape",
    description: "The domain of a context holds only entities, value objects, errors, domain events and ports. Each kind of file has its folder and its name pattern.",
    on: "file",
    /** The name of the files of each folder of the domain: what it says, and the name to give. */
    kinds: {
      entity: "the file of an entity is in PascalCase: entity/{Entity}.ts",
      "value-object": "the file of a value object is in PascalCase: value-object/{ValueObject}.ts",
      error: "the file of an error is in PascalCase: error/{Error}.ts",
      event: "the file of a domain event is in PascalCase: event/{DomainEvent}.ts",
      port: "a port is port/{port}/{Port}.ts, beside its contract {Port}.contract.ts"
    },
    /** @this {{ kinds: Record<string, string> }} */
    check({ path }) {
      if (!/^src\/(backend|frontend)\/[^/]+\/domain\//.test(path)
        || /^src\/(backend|frontend)\/[^/]+\/domain\/((entity|value-object)\/[A-Z]\w*(\.test)?|error\/[A-Z]\w*|event\/[A-Z]\w*|port\/[a-z0-9-]+\/[A-Z]\w*?(\.contract)?)\.ts$/.test(path)) return;
      const [, context, rest] = /^(src\/(?:backend|frontend)\/[^/]+)\/domain\/(.+)$/.exec(path) ?? [];
      const name = fileName(path);
      const parts = rest.split("/");
      const holds = "the domain holds only entity/, value-object/, error/, event/ and port/. Move its code into an entity or a value object, or move the file to the folder of its kind.";
      if (parts.length === 1) return `${name} is at the root of the domain, but ${holds}`;
      const [kind] = parts;
      if (!(kind in this.kinds)) return `${name} is in domain/${parts.slice(0, -1).join("/")}/, but ${holds}`;
      const test = name.endsWith(".test.ts");
      const contract = name.endsWith(".contract.ts");
      // A port is named after its folder, when the folder has the name of a port.
      const base = kind === "port" && parts.length === 3 && /^[a-z0-9-]+$/.test(parts[1]) ? pascalOf(parts[1]) : pascalOf(name.replace(/(\.test|\.contract)?\.[^.]+$/, ""));
      if (kind === "port" && parts.length === 2) {
        return `${name} is in port/, but a port lives in a folder of its own, port/{port}/{Port}.ts. Move it to ${context}/domain/port/${kebab(base)}/${name}.`;
      }
      if (test && kind !== "entity" && kind !== "value-object") {
        return `${name} is a test in ${kind}/, but in the domain only the entities and the value objects have a test. Test it through the application test of a use case${kind === "port" ? ", or through the contract of the port" : ""}.`;
      }
      const suggested = `${base}${test ? ".test" : contract ? ".contract" : ""}.ts`;
      const folder = kind === "port" ? `port/${kebab(base)}` : kind;
      if (parts.slice(0, -1).join("/") !== folder) return `${name} is in ${parts.slice(0, -1).join("/")}/, but its place is ${folder}/. Move it to ${context}/domain/${folder}/${suggested}.`;
      return `${name} is in ${folder}/, but ${this.kinds[kind]}. Rename it ${suggested}.`;
    }
  },
  {
    name: "domain-file-exports-one-name",
    description: "A domain file exports one name only. A port file exports its interface and its token with the same name.",
    on: "file",
    declarations: new Set(["class", "interface", "type", "const", "function", "enum"]),
    /** @this {{ declarations: Set<string> }} */
    check({ path, exports }) {
      if (!/^src\/(backend|frontend)\/[^/]+\/domain\/.+\.ts$/.test(path) || path.endsWith(".test.ts")) return;
      const names = exports.filter(({ kind }) => this.declarations.has(kind)).map(({ name }) => name);
      if (names.length === exports.length && new Set(names).size === 1) return;
      const file = fileName(path);
      const unnamed = exports.find(({ kind }) => kind === "default" || kind === "all");
      if (unnamed) {
        return at(unnamed.line, `${file} has an export without a name (${unnamed.kind === "all" ? "export *" : "export default"}), but a domain file exports one name. Export its declaration with its name: \`export class …\`.`);
      }
      const distinct = [...new Set(exports.map(({ name }) => name ?? ""))];
      if (distinct.length > 1) {
        const [kept, ...extras] = distinct;
        const first = exports.find(({ name }) => name === extras[0]) ?? exports[0];
        const port = /\/domain\/port\//.test(path) ? ", which the port and its token share" : "";
        return at(first.line, `${file} exports ${distinct.length} names (${distinct.join(", ")}), but a domain file exports one name${port}. Move ${listOf(extras)} into ${kept} as a static member, or to a file of its own.`);
      }
      const listed = exports.find(({ kind }) => kind === "specifier");
      if (listed) {
        return at(listed.line, `${file} exports ${listed.name} from a list, \`export { … }\`, but a domain file exports its one name where it declares it. Write \`export\` before the declaration of ${listed.name}.`);
      }
      return `${file} exports nothing, but a domain file exports one name. Write \`export\` before its declaration.`;
    }
  },
  {
    name: "entity-is-class",
    description: "An entity or a value object is an exported class. The class holds the business rules of its values.",
    on: "file",
    check: ({ path, classes, exports }) => {
      const kind = /^src\/(?:backend|frontend)\/[^/]+\/domain\/(entity|value-object)\/[A-Z]\w*\.ts$/.exec(path)?.[1];
      if (!kind || classes.some(({ exported }) => exported)) return;
      const rule = `${kind === "entity" ? "an entity" : "a value object"} is an exported class, which holds the business rules of its values.`;
      const [exported] = exports;
      return exported?.name
        ? at(exported.line, `${fileName(path)} exports ${exported.name} as ${kindOf(exported.kind)}, but ${rule} Make it a class, \`export class …\`, and put the rules of its values in it.`)
        : `${fileName(path)} exports no class, but ${rule} Write \`export class …\`, and put the rules of its values in it.`;
    }
  },
  {
    name: "error-extends-error",
    description: "A domain error is an exported class …Error that extends Error.",
    on: "file",
    check: ({ path, classes }) => {
      if (!/^src\/(?:backend|frontend)\/[^/]+\/domain\/error\/[^/]+\.ts$/.test(path)
        || classes.some(({ exported, name, extends: parent }) => exported && name !== null && /^\w+Error$/.test(name) && parent === "Error")) return;
      const rule = "a domain error is an exported class …Error that extends Error.";
      const declared = classes.find(({ extends: parent }) => parent === "Error") ?? classes.find(({ name }) => name !== null && /Error$/.test(name)) ?? classes[0];
      if (!declared) return `${fileName(path)} holds no class, but ${rule} Write \`export class …Error extends Error\`.`;
      const name = declared.name ?? "Its class";
      const fix = `Write \`export class ${declared.name !== null && /Error$/.test(declared.name) ? declared.name : `${declared.name ?? "…"}Error`} extends Error\`.`;
      if (!declared.exported) return at(declared.line, `${name} is not exported, but ${rule} ${fix}`);
      if (declared.extends !== "Error") return at(declared.line, `${name} extends ${declared.extends ?? "nothing"}, but ${rule} ${fix}`);
      return at(declared.line, `${name} does not end with Error, but ${rule} ${fix}`);
    }
  },
  {
    name: "port-folder-named-after-port",
    description: "The folder of a port has the name of the port in kebab-case: the port NoteRepository is in port/note-repository/. Its adapters use the same folder name in the infra.",
    on: "file",
    check: ({ path }, { paths }) => {
      const port = portOf(path);
      if (!port || kebab(port.name) === port.folder) return;
      const context = contextFolderOf(path);
      const folder = kebab(port.name);
      const adapters = [...paths].some(other => other.startsWith(`${context}/infra/${port.folder}/`));
      return `The ${port.contract ? "contract of the port" : "port"} ${port.name} is in port/${port.folder}/, but the folder of a port is its name in kebab-case, port/${folder}/. Move it to ${context}/domain/port/${folder}/${fileName(path)}${adapters ? `, and its adapters from ${context}/infra/${port.folder}/ to ${context}/infra/${folder}/` : ""}.`;
    }
  },
  {
    name: "port-has-contract",
    description: "Each port has a contract test, {Port}.contract.ts, next to it. The contract says what every adapter of the port must do.",
    on: "file",
    check: ({ path }, { paths }) => {
      const port = portOf(path);
      if (!port || port.contract || paths.has(`${port.module}.contract.ts`)) return;
      const infra = `${contextFolderOf(path)}/infra/${port.folder}/`;
      const tests = [...paths].filter(other => other.startsWith(infra) && other.endsWith(".test.ts")).map(fileName).sort();
      return `The port ${port.name} has no contract, so nothing says what each of its adapters must do. Write ${port.module}.contract.ts, and run it in the test of each adapter in ${infra}${tests.length > 0 ? ` (${tests.join(", ")})` : ""}.`;
    }
  },
  {
    name: "contract-next-to-port",
    description: "A contract test is in domain/port/{port}/, next to the port that it describes.",
    on: "file",
    check: ({ path }, { paths }) => {
      if (!path.endsWith(".contract.ts") || portOf(path)) return;
      const file = fileName(path);
      const name = file.slice(0, -".contract.ts".length);
      const ports = [...paths].filter(other => portOf(other)?.name === name && !portOf(other)?.contract).sort();
      if (ports.length === 1) return `${file} is the contract of ${name}, but it is not next to its port. Move it to ${folderOf(ports[0])}/${file}, beside ${ports[0]}.`;
      if (ports.length > 1) return `${file} is the contract of ${name}, but it is not next to its port. Move it next to the port that it describes: ${ports.map(port => `${folderOf(port)}/${file}`).join(", or ")}.`;
      return `${file} is a contract, but no port ${name} exists: a contract lives in domain/port/${kebab(name)}/, beside the port that it describes. Write the port ${name} in the domain/port/${kebab(name)}/ of its context, and move the contract beside it.`;
    }
  },
  {
    name: "contract-runs-in-adapter-test",
    description: "The test of at least one adapter runs each contract. A contract that no test runs checks nothing.",
    on: "file",
    check: (file, { files, paths, root }) => {
      const port = portOf(file.path);
      if (!port?.contract || files.some(other => adapterOf(other.path, paths)?.test && importedModules(other, root).includes(`${port.module}.contract`))) return;
      const describe = file.exports.find(({ kind }) => kind === "function")?.name ?? "the function that the contract exports";
      const infra = `${contextFolderOf(file.path)}/infra/${port.folder}/`;
      const adapters = [...paths].filter(other => other.startsWith(infra)).map(fileName).sort();
      if (adapters.length === 0) return `No test runs the contract of ${port.name}, so it checks nothing. Write an adapter of ${port.name} in ${infra}, with a test that calls ${describe}.`;
      const tests = adapters.filter(name => name.endsWith(".test.ts"));
      return `No test runs the contract of ${port.name}, so it checks nothing. Call ${describe} in the test of each adapter in ${infra} (${(tests.length > 0 ? tests : adapters).join(", ")}).`;
    }
  },
  {
    name: "domain-imports-only-listed-packages",
    description: "The domain imports only the packages, the modules of the kernel and the Node APIs that quality/imports.mjs lists for it. CAITS lists the primitives of the kernel: @ingenioz-it/caits/Result, /Token and /DomainEvent. The rest is technology: the domain declares a port, and the infra implements it.",
    on: "import",
    /** The fix for a module of the kernel that the list does not hold, by the folder of the module. */
    kernel: {
      messaging: "Let a handler publish the events, and keep the domain free of buses.",
      state: "Keep the state in the store of the presentation, and let the domain give values.",
      di: "Declare what the domain needs as a port, and let di.ts bind it.",
      other: "Move the code that needs it out of the domain."
    },
    /** @this {{ kernel: Record<string, string> }} */
    check({ file, from, specifier, internal }, { packages }) {
      const list = packages.domain;
      if (internal || from.layer !== "domain" || !list || isListed(specifier, list)) return;
      const kernel = kernelPathOf(specifier);
      if (kernel !== null) return `The domain layer imports ${specifier}, a module of the kernel that quality/imports.mjs does not list for the domain. ${this.kernel[kernel.split("/")[0]] ?? this.kernel.other}`;
      return `The domain layer imports ${specifier}, ${specifier.startsWith("node:") ? "a Node API" : "a package"} that quality/imports.mjs does not list for the domain. Declare what it needs as a port in ${contextFolderOf(file.path)}/domain/port/, and implement it in the infra; or, to use ${specifier} in the domain anyway, add it to the domain in quality/imports.mjs.`;
    }
  },
  {
    name: "application-imports-only-listed-packages",
    description: "The application (the handlers and the DTOs of the use cases, and the events of the frontend) imports only the packages, the modules of the kernel and the Node APIs that quality/imports.mjs lists for it. CAITS lists those of the domain and @ingenioz-it/caits/messaging/EventPublisher. The rest is technology: the domain declares a port, the infra implements it, and di.ts binds it.",
    on: "import",
    /** The fix for a module of the kernel that the list does not hold, by the folder of the module. */
    kernel: {
      state: "Keep the state in the store of the presentation, and publish an event that the store hears.",
      di: "Depend on a port of the domain, and let di.ts bind its adapter.",
      other: "Move the code that needs it into the presentation or the infra."
    },
    /** @this {{ kernel: Record<string, string> }} */
    check({ file, from, specifier, internal }, { packages }) {
      const list = packages.application;
      if (internal || from.layer !== "application" || !list || isListed(specifier, list)) return;
      const kernel = kernelPathOf(specifier);
      if (kernel !== null) return `The application layer imports ${specifier}, a module of the kernel that quality/imports.mjs does not list for the application. ${this.kernel[kernel.split("/")[0]] ?? this.kernel.other}`;
      const context = contextFolderOf(file.path);
      return `The application layer imports ${specifier}, ${specifier.startsWith("node:") ? "a Node API" : "a package"} that quality/imports.mjs does not list for the application. Declare what it needs as a port in ${context}/domain/port/, implement it in the infra, and bind the adapter in ${context}/di.ts; or, to use ${specifier} in the application anyway, add it to the application in quality/imports.mjs.`;
    }
  },
  listedPackages("presentation"),
  listedPackages("infra"),
  listedPackages("di"),
  listedPackages("map"),
  {
    name: "entity-without-port",
    description: "An entity or a value object does not import a port. It holds the business rules; the handlers call the ports.",
    on: "import",
    check: ({ file, from, specifier, target }) => {
      const kind = /\/domain\/(entity|value-object)\/(?:.+\/)?\w+\.ts$/.exec(file.path)?.[1];
      if (from.layer !== "domain" || !kind || !/\/domain\/port\//.test(target)) return;
      const name = file.classes.find(({ exported }) => exported)?.name ?? fileName(file.path).replace(/\.ts$/, "");
      const port = file.imported.find(({ from: source }) => source === specifier)?.name ?? fileName(target).replace(/\.(js|ts)$/, "");
      return `The ${kind === "entity" ? "entity" : "value object"} ${name} imports the port ${port} (${target}), but an entity or a value object holds business rules, and never talks to a port. Let the handler call ${port}, and give ${name} the values it needs.`;
    }
  },

  // Use cases: one folder each, in command/ or query/, with its DTOs, its handler, its controllers and their tests

  {
    name: "backend-use-case-shape",
    description: "A use case of a backend context has its folder, command/{usecase}/ or query/{usecase}/, which holds all of it: its DTOs, its handler and its test, {usecase}.application.test.ts, and its controllers, {usecase}.{name}.controller.ts, each with its test, {usecase}.{name}.presentation.test.ts. An endpoint lives in one folder, and the name of each test says the layer that it tests.",
    on: "file",
    check: ({ path }, { paths }) => /^src\/backend\/[^/]+\/(command|query)\//.test(path)
      && !/^src\/backend\/[^/]+\/(command|query)\/([a-z0-9-]+)\/\2(\.(handler|dto|application\.test)|\.[a-z0-9-]+\.(controller|presentation\.test))\.ts$/.test(path)
      && useCaseShape(path, "backend", paths)
  },
  {
    name: "frontend-use-case-shape",
    description: "A use case of a frontend context has its folder, command/{usecase}/ or query/{usecase}/, with its DTOs, its handler and its test, {usecase}.application.test.ts. The store sends its input DTOs: a use case of the frontend has no controller.",
    on: "file",
    check: ({ path, classes }, { paths }) => {
      if (!/^src\/frontend\/[^/]+\/(command|query)\//.test(path) || /^src\/frontend\/[^/]+\/(command|query)\/([a-z0-9-]+)\/\2\.(handler|dto|application\.test)\.ts$/.test(path)) return;
      const context = contextFolderOf(path);
      const name = fileName(path);
      if (name.endsWith(".controller.ts")) {
        const useCase = /\/(?:command|query)\/([^/]+)\/[^/]+$/.exec(path)?.[1] ?? name.split(".")[0];
        const store = [...paths].sort().find(other => other.startsWith(`${context}/presentation/store/`) && other.endsWith("Store.ts")) ?? "the store of the context";
        return `${name} is a controller, but a use case of the frontend has none: the store sends its DTOs to the message bus. Remove it, and let ${store} send the DTO of ${useCase}.`;
      }
      if (classes.some(({ properties }) => properties.some(({ name: property }) => property === "type"))) {
        return `${name} is an event, but the events of a frontend context live in event/. Move it to ${context}/event/${name}.`;
      }
      return useCaseShape(path, "frontend", paths);
    }
  },
  {
    name: "use-cases-isolated",
    description: "A use case imports nothing from another use case, of its context or of the context shared: each one holds all that it needs, and what two use cases share lives in the domain. Thus a use case changes, and goes, alone.",
    on: "import",
    check: ({ file, from, to, target }) => {
      if (!from.useCase || !to.useCase || to.side !== from.side || (to.context !== from.context && to.context !== "shared")
        || (to.context === from.context && to.useCase === from.useCase)) return;
      const context = contextFolderOf(file.path);
      const head = `The use case ${from.useCase} imports ${target}, a file of the use case ${to.useCase}${to.context === from.context ? "" : " of shared"}, but a use case imports nothing from another one: each changes, and goes, alone.`;
      if (to.context === from.context && file.path.endsWith(".controller.ts") && /\.dto\.(js|ts)$/.test(target)) {
        return `${head} Move this controller into ${context}/${to.useCase}/, since a controller sends the DTO of its own use case.`;
      }
      return `${head} Move what they share into ${context}/domain/.`;
    }
  },
  {
    name: "handler-answers-output",
    description: "A backend handler answers with output DTOs: the return type of its execute names only classes of the DTO file of its use case, one or several (`Promise<AddMessageOutput>`, `Promise<MessageAdded | MessageRefused>`).",
    on: "file",
    check: ({ path, classes, imported }) => {
      if (!/^src\/backend\/[^/]+\/(?:command|query)\/[^/]+\/[^/]+\.handler\.ts$/.test(path)) return;
      const rule = "a backend handler answers with output DTOs, classes of the DTO file of its use case. Give execute the type of its answers, "
        + "`Promise<AddMessageOutput>`, or `Promise<MessageAdded | MessageRefused>` for two, and declare each class in the DTO file.";
      const execute = classes.flatMap(({ name, methods }) => methods.filter(method => method.name === "execute").map(method => ({ ...method, label: name === null ? "Its execute" : `${name}.execute` })))[0];
      if (!execute) return `${fileName(path)} has no execute, but ${rule}`;
      if (!execute.returns) return at(execute.line, `${execute.label} has no return type, but ${rule}`);
      const dtos = new Set(imported.filter(({ from }) => /\.dto\.(js|ts)$/.test(from)).map(({ name }) => name));
      const others = execute.returns.filter(({ name }) => name === null || !dtos.has(name)).map(({ text }) => `\`${text}\``);
      if (others.length > 0) return at(execute.line, `${execute.label} answers with ${listOf(others)}, ${others.length > 1 ? "which are not DTOs" : "which is not a DTO"} of its use case, but ${rule}`);
    }
  },
  {
    name: "controller-extends-controller",
    description: "A controller is an exported class …Controller that extends the Controller of the kernel.",
    on: "file",
    check: ({ path, classes }) => {
      if (!/^src\/backend\/[^/]+\/(?:command|query)\/[^/]+\/[^/]+\.controller\.ts$/.test(path)
        || classes.some(({ exported, name, extends: parent }) => exported && name !== null && /^\w+Controller$/.test(name) && parent === "Controller")) return;
      const declared = classes.find(({ name }) => name !== null && /Controller$/.test(name)) ?? classes.find(({ extends: parent }) => parent === "Controller") ?? classes[0];
      const expected = declared?.name ? (/Controller$/.test(declared.name) ? declared.name : `${declared.name}Controller`) : "…Controller";
      const rule = `a controller is an exported class …Controller that extends the Controller of the kernel. Write \`export class ${expected} extends Controller\`, with Controller from @ingenioz-it/caits/messaging/Controller.`;
      if (!declared) return `${fileName(path)} holds no exported class …Controller, but ${rule}`;
      const name = declared.name ?? "Its class";
      if (!declared.exported) return at(declared.line, `${name} is not exported, but ${rule}`);
      if (declared.extends !== "Controller") return at(declared.line, `${name} extends ${declared.extends ?? "nothing"}, but ${rule}`);
      return at(declared.line, `${name} does not end with Controller, but ${rule}`);
    }
  },

  // Events of the frontend: what its views, its handlers and its context map publish

  {
    name: "frontend-event-shape",
    description: "The events of a frontend context are in event/, one file per event, at its root.",
    on: "file",
    check: ({ path }) => {
      const [, context, rest] = /^(src\/frontend\/[^/]+)\/event\/(.+)$/.exec(path) ?? [];
      if (!rest || /^[A-Z]\w*\.ts$/.test(rest)) return;
      return `${rest} is not an event file: the events of a frontend context are in event/, one file per event, at its root. Move it to ${context}/event/${pascalOf(fileName(rest).replace(/\.[^.]+$/, ""))}.ts.`;
    }
  },
  {
    name: "event-file-exports-its-event",
    description: "A frontend event file exports one name only: its event, a class, or the type that joins the events of the context.",
    on: "file",
    check: ({ path, exports }) => {
      const context = /^src\/frontend\/([^/]+)\/event\/\w+\.ts$/.exec(path)?.[1];
      if (!context) return;
      const file = fileName(path);
      if (exports.length === 0) return `${file} exports nothing, but an event file exports its event. Write \`export class … { readonly type = "${context}.…" as const; }\`.`;
      const names = exports.map(({ name }) => name ?? "default");
      if (exports.length > 1) {
        return at(exports[1].line, `${file} exports ${exports.length} names (${names.join(", ")}), but an event file exports only its event. Move ${listOf(names.slice(1))} into ${names[0]} as a static member, or to a file of its own.`);
      }
      const [exported] = exports;
      if (!["class", "type"].includes(exported.kind)) return at(exported.line, `${file} exports ${names[0]} as ${kindOf(exported.kind)}, but an event is a class, or a type that joins events. Write \`export class ${names[0]}\`.`);
    }
  },
  {
    name: "event-type-names-context",
    description: "A frontend event class has `readonly type = \"{context}.{event}\" as const`. The store reads this type: the context, then the name of the event without the context, in kebab-case.",
    on: "file",
    check: ({ path, classes }) => {
      const context = /^src\/frontend\/([^/]+)\/event\/\w+\.ts$/.exec(path)?.[1];
      const declared = classes.find(({ exported, name }) => exported && name !== null);
      if (!context || !declared?.name) return;
      const event = declared.name;
      const type = typeOfEvent(context, event);
      const write = `\`readonly type = "${type}" as const\``;
      const property = declared.properties.find(({ name }) => name === "type");
      if (!property) return at(declared.line, `${event} has no type, so the store cannot tell it from the other events. Add ${write}.`);
      if (property.value !== type) {
        const found = property.value === null ? "not a string" : `"${property.value}"`;
        return at(property.line, `The type of ${event} is ${found}, but it must be "${type}": the name of its context, then the name of the event without the context, in kebab-case. Write ${write}.`);
      }
      if (!property.readonly || !property.asConst) {
        const missing = !property.readonly && !property.asConst ? "neither readonly nor as const" : !property.readonly ? "not readonly" : "not as const";
        return at(property.line, `The type of ${event} is ${missing}, so the store cannot tell the events apart. Write ${write}.`);
      }
    }
  },

  // Presentation: the views, the components and the store of the frontend; the controllers live in their use cases

  {
    name: "frontend-presentation-shape",
    description: "The presentation of a frontend context holds only its views (one folder per view), its components (one folder per component: what its views share), its store and the type of its frontend. The pages are in the routes.",
    on: "file",
    check: ({ path }, { files, root }) => {
      const [, context, name, rest] = /^(src\/frontend\/([^/]+))\/presentation\/(.+)$/.exec(path) ?? [];
      if (!rest || /^((view|component)\/[a-z0-9-]+\/[^/]+|store\/[a-z]\w*Store\.ts|[A-Z]\w*Frontend\.ts)$/.test(rest)) return;
      const file = fileName(path);
      const frontend = `${pascalOf(name)}Frontend.ts`;
      const parts = rest.split("/");
      if (parts.length === 1) {
        const module = path.replace(/\.(js|ts)$/, "");
        const views = [...new Set(files.filter(other => importedModules(other, root).includes(module))
          .flatMap(other => /\/presentation\/view\/([a-z0-9-]+)\//.exec(other.path)?.[1] ?? []))];
        return `${file} is at the root of the presentation, which holds only ${frontend} besides view/, component/ and store/. Move it into the folder of the view that uses it${views.length === 1 ? `, view/${views[0]}/` : ""}, or into a component of component/ if several views share it.`;
      }
      const [folder] = parts;
      if (folder === "store") return `${file} is in store/, but the store of the context is store/${camelOf(name)}Store.ts. Rename it ${camelOf(name)}Store.ts, or move its code into the store.`;
      if ((folder === "view" || folder === "component") && parts.length === 2) {
        return `${file} is in ${folder}/ but in no folder of a ${folder}: ${folder}/ holds one folder each. Move it to ${folder}/${kebab(pascalOf(file.replace(/\..*$/, "")))}/${file}.`;
      }
      if (folder === "view" || folder === "component") {
        return `${rest} is not in a folder of a ${folder}: ${folder}/ holds one folder per ${folder}, named in kebab-case. Move it to ${context}/presentation/${folder}/${kebab(pascalOf(parts[1]))}/${file}.`;
      }
      return `${rest} is in presentation/${parts.slice(0, -1).join("/")}/, but the presentation holds only view/, component/, store/ and ${frontend}, and the pages live in src/routes/_frontend/. Move a page to src/routes/_frontend/, and the rest into a view or a component.`;
    }
  },
  {
    name: "zod-in-presentation",
    description: "In a layer without a list in quality/imports.mjs, only the presentation (the controllers of the use cases, and the presentation of the frontend) and the infra of the frontend import zod. zod checks the data that comes in; the other layers get typed values. In a layer with a list, the list says it.",
    on: "import",
    check: ({ from, specifier }, { packages }) => {
      if (!isPackage(specifier, "zod") || from.kind !== "layer" || packages[LISTS[from.layer]] || from.layer === "presentation" || (from.side === "frontend" && from.layer === "infra")) return;
      return from.side === "backend"
        ? `${subjectOf(from.layer)} imports zod, but in the backend only the controllers check data with zod. Check the data in the controller that receives it, and give ${objectOf(from.layer)} typed values.`
        : `${subjectOf(from.layer)} imports zod, but in the frontend only the presentation and the adapters of the infra check data with zod. Check the data where it comes in, and give ${objectOf(from.layer)} typed values.`;
    }
  },
  {
    name: "marko-in-frontend-presentation",
    description: "In a layer without a list in quality/imports.mjs, only the frontend presentation imports Marko: the routes import it too. The other layers stay free of the view technology. In a layer with a list, the list says it.",
    on: "import",
    check: ({ file, from, to, specifier }, { packages }) => {
      if (!isMarko(specifier) || from.kind !== "layer" || packages[LISTS[from.layer]] || (from.side === "frontend" && from.layer === "presentation")) return;
      // A template of the frontend presentation: the rules on the layers and the sides say what is wrong.
      if (to.kind === "layer" && to.side === "frontend" && to.layer === "presentation") return;
      return from.side === "frontend"
        ? `${subjectOf(from.layer)} imports ${specifier}, but only the presentation of the frontend and the routes use Marko. Move the template into a view of ${contextFolderOf(file.path)}/presentation/view/, and give the view its data as input.`
        : `The backend imports ${specifier}, but only the presentation of the frontend and the routes use Marko. Move the template into a view of a frontend context, which gets its data from the HTTP API of the backend.`;
    }
  },
  {
    name: "dtos-sent-by-store",
    description: "In the frontend, only the store and the application (the use cases and the events) import the input DTOs. A view publishes events; the store turns them into DTOs and sends them to the message bus.",
    on: "import",
    check: ({ file, specifier, target }, { paths }) => {
      const [, context, useCase] = /^(src\/frontend\/[^/]+)\/((?:command|query)\/[^/]+)\/.+\.dto\.(js|ts)$/.exec(target) ?? [];
      if (!context || /^src\/frontend\/[^/]+\/(presentation\/store|command|query|event)\//.test(file.path)) return;
      const names = file.imported.filter(({ from }) => from === specifier).map(({ name }) => name);
      const store = [...paths].sort().find(path => path.startsWith(`${context}/presentation/store/`) && path.endsWith("Store.ts")) ?? "the store of the context";
      return `This file imports ${names.length > 0 ? `${listOf(names)} (${target})` : target}, ${names.length > 1 ? "input DTOs" : "an input DTO"} of the use case ${useCase}, but in the frontend only the store sends input DTOs. Publish an event of ${context.split("/")[2]} instead, and let ${store} turn it into ${names.length > 0 ? listOf(names, "or") : "its DTO"}.`;
    }
  },
  {
    name: "events-built-with-new",
    description: "In the frontend, the code makes an event with `new SomeEvent(…)`, not as an object literal `{ type: \"…\" }`. The class gives the correct type and the correct data.",
    on: "file",
    check: ({ path, objectTypes, lines }, { files }) => {
      if (!/^src\/(frontend|routes\/_frontend)\//.test(path)) return;
      return objectTypes.flatMap((type, index) => {
        if (!/^[a-z]+\.[a-z-]+$/.test(type)) return [];
        const head = `This file builds the event "${type}" as an object literal, so nothing checks its type or its data.`;
        const event = files.flatMap(file => /^src\/frontend\/[^/]+\/event\//.test(file.path)
          ? file.classes.filter(({ properties }) => properties.some(({ name, value }) => name === "type" && value === type)).map(({ name }) => ({ name, path: file.path }))
          : [])[0];
        if (event) return [at(lines.objectTypes[index], `${head} Build it with \`new ${event.name}(…)\`, from ${event.path}.`)];
        const [context, name] = type.split(".");
        const guess = `${pascalOf(context)}${pascalOf(name)}`;
        return [at(lines.objectTypes[index], `${head} Write the class ${guess}, with \`readonly type = "${type}" as const\`, in a file of its own in src/frontend/${context}/event/, and build the event with \`new ${guess}(…)\`.`)];
      });
    }
  },
  {
    name: "views-take-own-frontend",
    description: "A view or a component takes only the frontend of its own context, with frontendOf. The contexts of the frontend do not share their frontends, not even the one of shared: to tell the other contexts, a view publishes an event of its context, and the context map shares it as an event of shared.",
    on: "file",
    production: true,
    check: file => {
      const where = locate(file.path);
      if (where.kind !== "layer" || where.side !== "frontend") return;
      const kind = /\/presentation\/view\//.test(file.path) ? "view" : /\/presentation\/component\//.test(file.path) ? "component" : "file";
      const head = (/** @type {string} */ other) => `This ${kind} of ${where.context} takes the frontend of ${other}, but a view or a component takes only the frontend of its own context.`;
      return frontendCallsOf(file).filter(({ context }) => context !== where.context).map(({ context: other, line }) => at(line, where.context === "shared"
        ? `${head(other)} Publish an event of shared instead: the context map of ${other} turns it into an event of its own.`
        : `${head(other)} Publish an event of ${where.context} instead, and share it as an event of shared in ${contextFolderOf(file.path)}/context-map.ts${other === "shared" ? "" : `: the context map of ${other} turns it into an event of its own`}.`));
    }
  },
  {
    name: "components-import-no-view",
    description: "A component of the frontend (presentation/component/) is a part of the views: it imports no view, of its context or of the context shared. It may take the frontend of its context, publish its events and read its store, as a view does.",
    on: "import",
    check: ({ file, target }) => {
      const component = /^src\/frontend\/[^/]+\/presentation\/component\/([^/]+)\//.exec(file.path)?.[1];
      const view = /^src\/frontend\/[^/]+\/presentation\/view\/([^/]+)\//.exec(target)?.[1];
      return component && view
        && `The component ${component} imports ${target}, a file of the view ${view}, but a component imports no view: the views place the components. Move what they both need into the component ${component}, and let a route place the view ${view}.`;
    }
  },
  {
    name: "views-import-no-view",
    description: "A view of the frontend imports nothing from another view. What views share is a component (presentation/component/); the routes place the views side by side.",
    on: "import",
    check: ({ file, target }) => {
      const view = /^(src\/frontend\/[^/]+)\/presentation\/view\/([^/]+)\//.exec(file.path);
      const other = /^(src\/frontend\/[^/]+)\/presentation\/view\/([^/]+)\//.exec(target);
      return view && other && view[1] === other[1] && view[2] !== other[2]
        && `The view ${view[2]} imports ${target}, a file of the view ${other[2]}, but a view imports nothing from another view. Move what they share into a component of ${view[1]}/presentation/component/, and let the route place the two views side by side.`;
    }
  },

  // Infra: the adapters of the ports

  {
    name: "backend-infra-shape",
    description: "The infra of a backend context holds only adapters: infra/{port}/{implementation}-{port}.ts and their tests.",
    on: "file",
    check: (file, { root }) => {
      const [, context, rest] = /^(src\/backend\/[^/]+)\/infra\/(.+)$/.exec(file.path) ?? [];
      if (!rest || /^([a-z0-9-]+)\/[a-z0-9-]+-\1(\.test)?\.ts$/.test(rest)) return;
      const parts = rest.split("/");
      const name = fileName(file.path);
      if (parts.length === 2 && /^[a-z0-9-]+$/.test(parts[0])) {
        const [folder] = parts;
        const test = name.endsWith(".test.ts") ? ".test" : "";
        const implementation = kebab(name.replace(/(\.test)?\.[^.]+$/, "")).replace(/[^a-z0-9-]+/g, "-").replace(new RegExp(`-?${folder}$`), "") || "{implementation}";
        return `${name} is in infra/${folder}/, but an adapter is named after its implementation and its port: {implementation}-${folder}.ts. Rename it ${implementation}-${folder}${test}.ts.`;
      }
      const port = implementedPortOf(file, root);
      return `infra/${rest} is in no folder of a port: the infra holds one folder per port, infra/{port}/. Move it into the folder of the port that it implements${port ? `, ${context}/infra/${port.folder}/` : ""}.`;
    }
  },
  {
    name: "infra-folder-implements-port",
    description: "Each folder of infra/ is for a port that the domain declares: infra/{port}/ goes with domain/port/{port}/.",
    on: "file",
    check: (file, { paths, root }) => {
      const adapter = adapterOf(file.path, paths);
      if (!adapter || adapter.portModule) return;
      const context = contextFolderOf(file.path);
      const port = implementedPortOf(file, root);
      if (port) return `${port.implementer} implements ${port.name}, but it is in infra/${adapter.folder}/, and the domain has no port in domain/port/${adapter.folder}/. Move it to ${context}/infra/${port.folder}/.`;
      return `infra/${adapter.folder}/ is the folder of a port, but the domain has no port in domain/port/${adapter.folder}/. Write the port in ${context}/domain/port/${adapter.folder}/, or move the adapter into the folder of the port that it implements.`;
    }
  },
  {
    name: "adapter-implements-port",
    description: "An adapter in infra/{port}/ implements the port of its folder: the interface that it imports from domain/port/{port}/.",
    on: "file",
    check: (file, { paths, files, root }) => {
      const adapter = adapterOf(file.path, paths);
      if (!adapter?.portModule || adapter.test) return;
      const imported = namesFrom(file, adapter.portModule, root);
      if (file.classes.some(declared => declared.implements.some(name => imported.has(name)))) return;
      const port = portNameOf(adapter.portModule, files);
      const write = `with \`import type { ${port} } from "#context/${adapter.portModule.split("/").slice(3).join("/")}.js"\``;
      const declared = file.classes.find(({ exported }) => exported) ?? file.classes[0];
      if (!declared) return `${fileName(file.path)} holds no class, but an adapter of infra/${adapter.folder}/ is a class that implements ${port}. Write \`export class … implements ${port}\`, ${write}.`;
      const name = declared.name ?? "Its class";
      if (declared.implements.includes(port)) return at(declared.line, `${name} implements a ${port} that is not the port of infra/${adapter.folder}/, from ${adapter.portModule}.ts. Implement the port, ${write}.`);
      const others = declared.implements.length > 0 ? `; it implements ${listOf(declared.implements)}` : "";
      return at(declared.line, `${name} does not implement ${port}, the port of infra/${adapter.folder}/${others}. Write \`export class ${declared.name ?? "…"} implements ${port}\`, ${write}.`);
    }
  },
  {
    name: "adapter-test-runs-contract",
    description: "The test of an adapter runs the contract of its port. Thus all the adapters of a port do the same things.",
    on: "file",
    check: (file, { files, paths, root }) => {
      const adapter = adapterOf(file.path, paths);
      if (!adapter?.test || !adapter.portModule || importedModules(file, root).includes(`${adapter.portModule}.contract`)) return;
      const port = portNameOf(adapter.portModule, files);
      const testedPath = file.path.replace(/\.test\.ts$/, ".ts");
      const tested = files.find(other => other.path === testedPath)?.classes.find(({ exported }) => exported)?.name;
      const name = tested ?? fileName(testedPath);
      const describe = files.find(other => other.path === `${adapter.portModule}.contract.ts`)?.exports.find(({ kind }) => kind === "function")?.name;
      const contract = `#context/${adapter.portModule.split("/").slice(3).join("/")}.contract.js`;
      return `This test does not run the contract of ${port}, so nothing proves that ${name} does what every adapter of ${port} does. Import ${describe ?? "the function of the contract"} from "${contract}", and call it with a factory of ${tested ?? "the adapter"}.`;
    }
  },

  // di.ts: the bindings of a context

  {
    name: "di-holds-bindings",
    description: "A di.ts or a test.di.ts has one export, a list of bindings: `export default [bind(Port).to(Adapter), …]`. It builds nothing: the kernel reads the list and builds the dependencies.",
    on: "file",
    methods: new Set(["to", "toValue", "toFactory", "with"]),
    /** @this {{ methods: Set<string> }} */
    check({ path, exports, defaultArray }, { files }) {
      if (!/^src\/(backend|frontend)\/[^/]+\/(test\.)?di\.ts$/.test(path)) return;
      const file = fileName(path);
      const fix = "Write `export default [bind(Port).to(Adapter), …]`, and nothing else.";
      if (exports.length > 1) {
        const other = exports.find(({ kind }) => kind !== "default") ?? exports[1];
        return at(other.line, `${file} exports ${exports.length} names (${exports.map(({ name }) => name).join(", ")}), but a di.ts has one export, the list of its bindings. ${fix}`);
      }
      if (!defaultArray) {
        const message = `${file} exports no list, but a di.ts has one export, the list of its bindings. ${fix}`;
        return exports.length === 0 ? message : at(exports[0].line, message);
      }
      return defaultArray.filter(({ chain: [first, ...methods] }) => first !== "bind" || methods.length === 0 || !methods.every(method => this.methods.has(method)))
        .map(({ chain, source, subject, constructed: [built], line }) => {
          const adapter = built ?? "Adapter";
          const port = (built && files.flatMap(other => other.classes).find(({ name }) => name === built)?.implements[0]) ?? (chain[0] === "bind" ? subject : null) ?? "Port";
          return at(line, `The item \`${source}\` is not a binding, but a di.ts only binds: the kernel builds the dependencies. Write it \`bind(${port}).to(${adapter})\`.`);
        });
    }
  },
  {
    name: "di-read-by-kernel",
    description: "No layer imports the di.ts of a context. Only the kernel reads it.",
    on: "import",
    check: ({ from, to, target }) => from.kind === "layer" && to.layer === "di"
      && `This file imports ${target}, the di.ts of ${to.context}, but only the kernel reads a di.ts. Depend on the port that it needs instead, and the kernel gives it the adapter that di.ts binds.`
  },

  // Contexts: their folders, and what their layers import

  {
    name: "sides-hold-contexts",
    description: "src/backend and src/frontend hold only the contexts: a context map goes in its context. src/backend holds the integration tests of the whole backend too (*.integration.test.ts).",
    on: "file",
    check: ({ path }, { paths }) => {
      const [, side, inside] = /^src\/(backend|frontend)\/([^/]+)$/.exec(path) ?? [];
      if (!side || (side === "backend" && /^[\w.-]+\.integration\.test\.ts$/.test(inside))) return;
      const integration = side === "backend" ? ", and the integration tests of the whole backend (*.integration.test.ts)" : "";
      if (/^context-map\.(js|ts)$/.test(inside)) {
        return `${path} is not in a context, but src/${side} holds only its contexts${integration}. Move each of its lines into the context map of the context that reacts, src/${side}/{context}/context-map.ts.`;
      }
      if (side === "backend" && inside.endsWith(".test.ts")) {
        return `${inside} is a test of the whole backend, but its name does not say so. Rename it ${inside.replace(/\.test\.ts$/, "")}.integration.test.ts, or move it into the context that it tests.`;
      }
      const contexts = [...new Set([...paths].flatMap(other => new RegExp(`^src/${side}/[^/]+/`).exec(other)?.[0] ?? []))].sort();
      return `${inside} is in src/${side} but in no context: src/${side} holds only its contexts${integration}. Move it into the context that it belongs to${contexts.length > 0 ? `, such as ${contexts.join(" or ")}` : ""}.`;
    }
  },
  {
    name: "context-content",
    description: "A context holds its domain, its infra, and its use cases in command/ and query/: a use case holds its controllers. A context of the frontend holds its events too, in event/, and its presentation, in presentation/: its views, its components and its store serve several use cases. A context holds also its di.ts and its test.di.ts (and its package.json, which gives the shortcut #context), and its context map, context-map.ts and its test: the events of the context shared that it hears, and the events of its own that it shares.",
    on: "file",
    folders: { backend: ["domain", "infra", "command", "query"], frontend: ["domain", "infra", "command", "query", "event", "presentation"] },
    /** @this {{ folders: Record<string, string[]> }} */
    check({ path }) {
      const [, context, side, inside] = /^(src\/(backend|frontend)\/[^/]+)\/(.+)$/.exec(path) ?? [];
      const folders = side && this.folders[side];
      if (!folders || folders.some(folder => inside.startsWith(`${folder}/`)) || /^(di|test\.di|context-map(\.test)?)\.ts$/.test(inside)) return;
      const moved = /^application\/((command|query)\/.+)$/.exec(inside)?.[1] ?? (side === "frontend" ? /^application\/(event\/.+)$/.exec(inside)?.[1] : undefined);
      if (moved) return `${inside} is in application/, but a context holds its use cases at its root, in command/ and query/, and the events of the frontend in event/. Move it to ${context}/${moved}.`;
      return `${inside} is in no folder of its context: a context of the ${side} holds ${listOf(folders.map(folder => `${folder}/`))}, with di.ts, test.di.ts and context-map.ts. Move its code into the domain if it holds business rules, into the use case that needs it, or into infra/, behind a port, if it talks to the outside world.`;
    }
  },
  {
    name: "context-map-translates-shared",
    description: "The context map of a context translates between its context and the context shared. It turns the events of shared into what its context reacts to: input DTOs of its context in the backend, events of its context in the frontend. It also turns the events of its context that it shares into events of shared. It imports only those, the events of its context and of shared, and the values of the domain.",
    on: "import",
    check: ({ file, to, target }) => {
      const [, side, context] = /^src\/(backend|frontend)\/([^/]+)\/context-map\.ts$/.exec(file.path) ?? [];
      if (!side || to.kind !== "layer" || to.side !== side || (to.context !== context && to.context !== "shared")) return;
      const reads = side === "backend"
        ? to.layer === "domain" || (to.context === context && /^src\/backend\/[^/]+\/(command|query)\/[^/]+\/[^/.]+\.dto\.(js|ts)$/.test(target))
        : to.layer === "domain" || /^src\/frontend\/[^/]+\/event\//.test(target);
      if (reads) return;
      if (side === "frontend") {
        return `The context map imports ${target}, ${fileKindOf(target)}, but a context map of the frontend only translates: it imports events and the values of the domain. Give an event of ${context} from the line instead: the store and the handlers hear it.`;
      }
      const head = `The context map imports ${target}, ${fileKindOf(target)}, but a context map only translates: it imports events, the input DTOs of its context, and the values of the domain.`;
      if (to.context === context && to.useCase && /\.(handler|controller)\.(js|ts)$/.test(target)) {
        return `${head} Import the input DTO from src/backend/${context}/${to.useCase}/${to.useCase.split("/")[1]}.dto.js instead, and give it from the line: the kernel sends it to the handler.`;
      }
      return `${head} Remove the import, and give an event or an input DTO from the line.`;
    }
  },
  {
    name: "context-map-holds-lines",
    description: "A context map has one export, the list of its lines: `export default [when(Event, event => […]), share(Event, event => […])]`. It takes when and share from the kernel, for its side: @ingenioz-it/caits/messaging/ContextMap in the backend, @ingenioz-it/caits/messaging/FrontendContextMap in the frontend. The kernel reads the list.",
    on: "file",
    modules: { backend: "@ingenioz-it/caits/messaging/ContextMap", frontend: "@ingenioz-it/caits/messaging/FrontendContextMap" },
    /** @this {{ modules: Record<string, string> }} */
    check({ path, exports, defaultArray, imported }) {
      const [, side, context] = /^src\/(backend|frontend)\/([^/]+)\/context-map\.ts$/.exec(path) ?? [];
      if (!side) return;
      if (exports.length !== 1 || !defaultArray) {
        const what = exports.length === 0 ? "nothing"
          : exports.length > 1 ? `${exports.length} names (${exports.map(({ name }) => name).join(", ")})`
          : exports[0].kind === "default" ? "a default that is not a list" : `its lines by name, ${exports[0].name}`;
        const message = `The context map exports ${what}, but a context map has one export, the list of its lines. Write \`export default [when(Event, event => […]), share(Event, event => […])]\`, and nothing else.`;
        return exports.length === 0 ? message : at((exports.find(({ kind }) => kind !== "default") ?? exports[0]).line, message);
      }
      const module = this.modules[side];
      return [
        ...defaultArray.filter(({ chain }) => chain.length !== 1 || (chain[0] !== "when" && chain[0] !== "share"))
          .map(({ source, line }) => at(line, `The item \`${source}\` is not a line: each line of a context map is made with when(…) or share(…). Write it \`when(SharedEvent, event => […])\` to hear an event of shared, or \`share(OwnEvent, event => […])\` to share an event of ${context}.`)),
        ...imported.filter(({ name, from }) => (name === "when" || name === "share") && from !== module)
          .map(({ name, from, line }) => at(line, `The context map takes ${name} from ${from}, but a context map of the ${side} takes it from ${module}. Import ${name} from ${module}.`))
      ];
    }
  },
  {
    name: "context-map-line-direction",
    description: "Each line of a context map goes one way. share(Event, …) starts from an event of its context, that a handler publishes (in the frontend, also a view or a component), and gives events of shared. when(Event, …) starts from an event of shared, which comes on the shared bus, and gives what its context reacts to: its input DTOs in the backend, its events in the frontend. The kernel reads the lines that share on the events of the context, and those that hear on the shared bus: a line that goes the other way never starts, and its test passes all the same.",
    on: "file",
    check(file, { root }) {
      const [, side, context] = /^src\/(backend|frontend)\/([^/]+)\/context-map\.ts$/.exec(file.path) ?? [];
      if (!side) return;
      const events = side === "backend" ? "domain/event" : "event";
      const own = `src/${side}/${context}/${events}/`;
      const shared = `src/${side}/shared/${events}/`;
      /** What the context reacts to: the input DTOs of its use cases in the backend, its events in the frontend. @type {(module: string) => boolean} */
      const reacts = module => side === "backend" ? [`src/backend/${context}/command/`, `src/backend/${context}/query/`].some(folder => module.startsWith(folder)) : module.startsWith(own);
      /** @type {(module: string) => boolean} */
      const isMessage = module => /^src\/(backend|frontend)\/[^/]+\/(domain\/event|event|command|query)\//.test(module);
      const reaction = side === "backend" ? `an input DTO of src/backend/${context}/command/ or src/backend/${context}/query/` : `an event of src/frontend/${context}/event/`;
      return linesOf(file, root).flatMap(({ shares, event, gives, line }) => {
        const name = event?.name ?? "…";
        /** @type {string[]} */
        const messages = [];
        if (event && shares && !event.module.startsWith(own)) {
          messages.push(event.module.startsWith(shared)
            ? `The line \`share(${name}, …)\` starts from ${name}, an event of shared, but share(…) starts from an event of ${context}: this line never runs. Write it \`when(${name}, …)\` to react to ${name}, or start it from an event of ${own}.`
            : `The line \`share(${name}, …)\` starts from ${name}, which is not an event of ${context}: this line never runs. Start it from an event of ${own}.`);
        }
        if (event && !shares && !event.module.startsWith(shared)) {
          messages.push(event.module.startsWith(own)
            ? `The line \`when(${name}, …)\` starts from ${name}, an event of ${context}, but when(…) hears an event of shared, from the shared bus: this line never runs. Write it \`share(${name}, …)\` to share it, or hear an event of ${shared}.`
            : `The line \`when(${name}, …)\` starts from ${name}, which is not an event of shared: this line never runs. Hear an event of ${shared}.`);
        }
        for (const given of gives.filter(({ module }) => isMessage(module) && !(shares ? module.startsWith(shared) : reacts(module)))) {
          messages.push(shares
            ? `The line \`share(${name}, …)\` gives ${given.name}, which is not an event of shared, but share(…) gives events of shared. Give an event of ${shared} instead.`
            : `The line \`when(${name}, …)\` gives ${given.name}, which is not ${side === "backend" ? "an input DTO" : "an event"} of ${context}, but when(…) gives what its context reacts to. Give ${reaction} instead.`);
        }
        return messages.map(message => at(line, message));
      });
    }
  },
  {
    name: "context-maps-without-cycle",
    description: "In the frontend, a bus carries an event at once: a line when(Shared, …) that gives Own, and a line share(Own, …) that gives Shared, would carry them without end, and the page would stop. The context maps of the frontend make no cycle of events, in one map or across several. In the backend, a cycle goes through a handler, which the maps do not show.",
    on: "project",
    check({ files, root }) {
      /** @typedef {{ module: string; map: string; line: number }} Step a step of a cycle: the event that it gives, and the line of the map that gives it */
      /** @type {Map<string, { to: string; map: string; line: number }[]>} */
      const edges = new Map();
      /** @type {(module: string) => boolean} */
      const isShared = module => module.startsWith("src/frontend/shared/");
      for (const file of files) {
        if (!/^src\/frontend\/[^/]+\/context-map\.ts$/.test(file.path)) continue;
        for (const { event, gives, line } of linesOf(file, root)) {
          if (!event) continue;
          // An event goes from shared to the context, or from the context to shared: a line that goes otherwise never starts.
          for (const { module } of gives.filter(given => /^src\/frontend\/[^/]+\/event\//.test(given.module) && isShared(given.module) !== isShared(event.module))) {
            edges.set(event.module, [...edges.get(event.module) ?? [], { to: module, map: file.path, line }]);
          }
        }
      }
      /** @type {Map<string, { file: string; line: number; message: string }>} */
      const cycles = new Map();
      /** @type {(path: Step[]) => void} */
      const follow = path => {
        for (const { to, map, line } of edges.get(path[path.length - 1].module) ?? []) {
          const steps = [...path.slice(1), { module: to, map, line }];
          if (to === path[0].module) {
            const first = steps.reduce((least, step, index) => step.module < steps[least].module ? index : least, 0);
            const cycle = [...steps.slice(first), ...steps.slice(0, first)];
            const names = [...cycle, cycle[0]].map(({ module }) => module.split("/").pop());
            // The step that gives an event is the line of the map that leads to it: names[i] → names[i + 1] is cycle[i + 1].
            const lines = cycle.map((_, index) => `${names[index]} → ${names[index + 1]} in ${cycle[(index + 1) % cycle.length].map}`);
            cycles.set(names.join(" → "), {
              file: cycle[0].map,
              line: cycle[0].line,
              message: `The context maps of the frontend make a cycle of events, ${names.join(" → ")}, which the buses would carry without end, and the page would stop. Remove one of its lines: ${lines.join(", or ")}.`
            });
          } else if (!path.some(step => step.module === to)) follow([...path, { module: to, map, line }]);
        }
      };
      for (const module of edges.keys()) follow([{ module, map: "", line: 0 }]);
      return [...cycles.values()];
    }
  },
  {
    name: "shared-events-in-map",
    description: "A context talks to the other contexts only through its context map: a handler (in the frontend, also a view or a component) publishes an event of its context, the map shares it as an event of shared on the shared bus, and the map of each context that hears it turns it into what its context reacts to. Thus, in a context other than shared, only the context map imports the events of shared: those of the backend, in domain/event/, and those of the frontend, in event/.",
    on: "import",
    // The layers that could import them, but the context map; the rules on the layers refuse the others already.
    events: {
      backend: { folder: /^src\/backend\/shared\/domain\/event\//, layers: ["domain", "application", "infra", "presentation", "di"] },
      frontend: { folder: /^src\/frontend\/shared\/event\//, layers: ["application", "infra", "presentation"] }
    },
    /** @this {{ events: Record<string, { folder: RegExp; layers: string[] }> }} */
    check({ file, from, specifier, target }) {
      const events = from.kind === "layer" && from.context !== "shared" && this.events[from.side];
      if (!events || !events.layers.includes(from.layer) || !events.folder.test(target)) return;
      const names = file.imported.filter(({ from: module }) => module === specifier).map(({ name }) => name);
      const context = contextFolderOf(file.path);
      return `This file imports ${names.length > 0 ? `${listOf(names)} (${target})` : target}, an event of shared, but in a context other than shared only the context map names the events of shared. Publish an event of ${from.context} instead, in ${context}/${from.side === "backend" ? "domain/event" : "event"}/, and share it as ${names.length > 0 ? listOf(names, "or") : "an event of shared"} in ${context}/context-map.ts.`;
    }
  },
  {
    name: "shared-hears-no-context",
    description: "The context shared, in the backend and in the frontend, has no context map: it hears no other context, and its events are on the shared bus already. The contexts hear it.",
    on: "file",
    check: ({ path }) => /^src\/(backend|frontend)\/shared\/context-map\.ts$/.test(path)
      && "The context shared has a context map, but shared hears no other context: its events are on the shared bus already, and the contexts hear them. Remove this file, and move each of its lines into the context map of the context that reacts."
  },
  {
    name: "context-has-di",
    description: "Each folder of src/backend and src/frontend is a context, and has a di.ts. The kernel finds the contexts by their di.ts.",
    on: "project",
    check: ({ paths, files }) => {
      const contexts = new Set([...paths].map(path => /^src\/(backend|frontend)\/[^/]+(?=\/)/.exec(path)?.[0]).filter(context => context !== undefined));
      const adapters = files.filter(file => /\/infra\//.test(file.path) && !isTestCode(file.path)).sort((first, second) => first.path < second.path ? -1 : 1);
      return [...contexts].filter(context => !paths.has(`${context}/di.ts`)).map(context => {
        const bindings = [...paths].sort().flatMap(path => {
          const port = path.startsWith(`${context}/`) ? portOf(path) : null;
          if (!port || port.contract) return [];
          const name = portNameOf(port.module, files);
          const adapter = adapters.filter(file => file.path.startsWith(`${context}/infra/${port.folder}/`)).flatMap(file => file.classes).find(declared => declared.implements.includes(name));
          return adapter ? [`bind(${name}).to(${adapter.name})`] : [];
        });
        return { file: context, message: `${context} is a context, but it has no di.ts, so the kernel does not find it. Write ${context}/di.ts with its bindings: \`export default [${bindings.join(", ")}]\`.` };
      });
    }
  },
  {
    name: "shared-components-are-tags",
    description: "A component of the frontend context shared is a Marko tag: its folder holds its index.marko, and src/frontend/marko.json gives Marko the folder of these tags, { \"tags-dir\": \"./shared/presentation/component\" }. A context places it by its name, <badge>: Marko finds it, where an import of its file would not build.",
    on: "project",
    check: ({ root, paths }) => {
      const folders = new Set([...paths].map(path => /^src\/frontend\/shared\/presentation\/component\/[a-z0-9-]+(?=\/)/.exec(path)?.[0]).filter(folder => folder !== undefined));
      const untagged = [...folders].filter(folder => !paths.has(`${folder}/index.marko`)).map(folder => {
        const templates = [...paths].filter(path => folderOf(path) === folder && path.endsWith(".marko"));
        return {
          file: folder,
          message: `The component ${fileName(folder)} of shared has no index.marko, but a component of the frontend context shared is a Marko tag, which its index.marko holds. ${templates.length === 1 ? `Rename ${templates[0]} to index.marko.` : `Write ${folder}/index.marko.`}`
        };
      });
      if (folders.size === 0 || givesSharedTags(root)) return untagged;
      const missing = !existsSync(join(root, "src/frontend/marko.json"));
      return [...untagged, {
        file: "src/frontend/marko.json",
        message: `src/frontend/marko.json ${missing ? "is missing" : "does not give Marko the folder of the components of shared"}, so the contexts cannot place them by their tag. Write \`{ "tags-dir": "./shared/presentation/component" }\` in src/frontend/marko.json.`
      }];
    }
  },
  {
    name: "shared-components-placed-by-tag",
    description: "A context of the frontend places a component of the context shared by its tag (<badge>), and does not import its file: Marko reads an import of a template from the package.json of the context, whose shortcuts lead only into it.",
    on: "import",
    check: ({ from, specifier, target }) => {
      if (from.kind !== "layer" || from.context === "shared" || !specifier.startsWith("#") || !/^src\/frontend\/shared\/presentation\/component\/[a-z0-9-]+\/[^/]+\.marko$/.test(target)) return;
      const name = target.split("/")[5];
      return `This file imports ${target}, the component ${name} of shared, but Marko does not build an import of its file from another context. Remove the import, and place the component by its tag, \`<${name}>\`.`;
    }
  },
  {
    name: "imports-by-shortcut",
    description: "In src, an import does not go up a folder (../). A context imports its own files with #context/, and the context shared of its side with #shared/ in the backend, #frontend-shared/ in the frontend; a route imports the contexts with #backend/ and #frontend/. Thus an import does not change when its file moves. A stylesheet loads only the files of its folder: Sass reads # as the start of a fragment, and a view reads the values of the theme as CSS variables.",
    on: "file",
    check: ({ path, imports, lines }, { root }) => path.startsWith("src/") && imports.flatMap((specifier, index) => {
      if (!specifier.split("/").includes("..")) return [];
      if (path.endsWith(".scss")) {
        return [at(lines.imports[index], `This stylesheet loads ${specifier}, which goes up a folder, but a stylesheet loads only the files of its folder: Sass reads # as the start of a fragment. Read the values of the theme as CSS variables instead.`)];
      }
      const shortcut = shortcutOf(path, resolveImport(path, specifier, root).target);
      return [at(lines.imports[index], `This file imports ${specifier}, which goes up a folder: the import breaks when the file moves. ${shortcut ? `Import it as ${shortcut}.` : "Use #context/ in a context, #shared/ or #frontend-shared/ for shared, and #backend/ or #frontend/ in a route."}`)];
    })
  },
  {
    name: "contexts-isolated",
    description: "A context does not import another context of its side, except the context shared of its side. The contexts talk through the shared bus: the context map of a context shares an event of the context as an event of shared, and the context map of each context that hears it turns it into what it reacts to, input DTOs of its own in the backend, events of its own in the frontend. In the frontend, a route places the views of several contexts side by side.",
    on: "import",
    check: ({ file, from, to, target }) => {
      if (from.kind !== "layer" || to.kind !== "layer" || to.side !== from.side || to.layer === "di" || to.context === from.context || to.context === "shared") return;
      const reaction = from.side === "backend" ? "an input" : "an event";
      const view = /\/presentation\/view\/([^/]+)\//;
      const views = from.side === "frontend" && view.exec(file.path);
      if (views && view.test(target)) return `The view ${views[1]} of ${from.context} imports ${target}, a view of ${to.context}, but a context never imports another context. Let the route place the two views side by side.`;
      const head = `The context ${from.context} imports ${target}, a file of the context ${to.context}, but a context never imports another context.`;
      if (from.context === "shared") return `${head} Publish an event of shared: the context map of ${to.context} turns it into ${reaction} of its own.`;
      return `${head} Publish an event of ${from.context}, share it as an event of shared in ${contextFolderOf(file.path)}/context-map.ts, and turn it into ${reaction} of ${to.context} in src/${to.side}/${to.context}/context-map.ts.`;
    }
  },
  {
    name: "tests-in-one-context",
    description: "A test reads one context, and the context shared of its side: a test in a context reads only its context, and a test out of the contexts (src/backend/*.integration.test.ts, test/) one context at most. No test crosses contexts: each context is tested alone, and its context map on its own lines, what it shares and what it does with an event of shared. A test of the frontend builds only the frontend of its context, with testPresentation.",
    on: "file",
    check: (file, { root }) => {
      if (!isTestCode(file.path)) return;
      const [source, side, context, ...rest] = file.path.split("/");
      const own = source === "src" && (side === "backend" || side === "frontend") && rest.length > 0 ? `${side}/${context}` : undefined;
      /** Each context that the test reads, at the line of the import, or of testPresentation. @type {{ context: string; line: number }[]} */
      const reads = [
        ...file.imports.flatMap((specifier, index) => {
          const { internal, target } = resolveImport(file.path, specifier, root);
          return internal && /^src\/(backend|frontend)\/[^/]+\/./.test(target) ? [{ context: target.split("/").slice(1, 3).join("/"), line: file.lines.imports[index] }] : [];
        }),
        ...file.calls.flatMap(({ name, args: [built], line }) => name === "testPresentation" && typeof built === "string" ? [{ context: `frontend/${built}`, line }] : [])
      ].sort((first, second) => first.line - second.line);
      const read = [...new Set(reads.map(({ context: name }) => name))];
      if (own) {
        const others = read.filter(name => name !== own && name !== `${side}/shared`);
        const first = reads.find(({ context: name }) => others.includes(name));
        return first && at(first.line, `This test of ${own} reads ${listOf(others)}, but a test reads only its context and shared: each context is tested alone. Split it: test in ${own} what its context map shares, and in ${others[0]} what its context map does with that event of shared.`);
      }
      /** Whether contexts are too many for a test out of the contexts: two contexts, or two sides. @type {(names: string[]) => boolean} */
      const tooMany = names => names.filter(name => !name.endsWith("/shared")).length > 1 || new Set(names.map(name => name.split("/")[0])).size > 1;
      const first = reads.find((_, index) => tooMany([...new Set(reads.slice(0, index + 1).map(({ context: name }) => name))]));
      return first && at(first.line, `This test reads ${listOf(read)}, but a test outside the contexts reads one context at most, and the context shared of its side. Split it into one test per context.`);
    }
  },
  {
    name: "sides-apart",
    description: "A frontend context and a backend context do not import each other. They are two projects: they talk only through the HTTP API.",
    on: "import",
    check: ({ file, from, to, target }) => {
      if (from.kind !== "layer" || to.kind !== "layer" || to.side === from.side) return;
      const context = contextFolderOf(file.path);
      return from.side === "frontend"
        ? `The frontend imports ${target}, a file of the backend, but the frontend and the backend are two projects, which talk only through the HTTP API. Declare what the frontend needs in ${context}, and call the API through an adapter of ${context}/infra/, behind a port.`
        : `The backend imports ${target}, a file of the frontend, but the frontend and the backend are two projects, which talk only through the HTTP API. Declare what the backend needs in ${context}.`;
    }
  },
  {
    name: "domain-imports-no-application",
    description: "The domain does not import the application: a use case (its DTOs, its handler), or an event of the frontend. The use cases depend on the domain, not the other way.",
    on: "import",
    check: ({ file, from, to, target }) => {
      if (!withinContext(from, to) || from.layer !== "domain" || to.layer !== "application") return;
      const head = `The domain layer must not import the application layer (${target}): the use cases depend on the domain, not the other way.`;
      return /\.dto\.(js|ts)$/.test(target)
        ? `${head} Let the handler read the DTO, and give ${fileName(file.path).replace(/\.[^.]+$/, "")} the values it needs.`
        : `${head} Move what the domain needs into ${contextFolderOf(file.path)}/domain/.`;
    }
  },
  {
    name: "domain-imports-no-presentation",
    description: "The domain does not import the presentation: a controller, or the presentation of the frontend. The presentation reads the domain, not the other way.",
    on: "import",
    check: ({ file, from, to, target }) => withinContext(from, to) && from.layer === "domain" && to.layer === "presentation"
      && `The domain layer must not import the presentation layer (${target}): the presentation reads the domain, not the other way. Move what the domain needs into ${contextFolderOf(file.path)}/domain/.`
  },
  {
    name: "domain-imports-no-infra",
    description: "The domain does not import the infra: it declares what it needs as a port, and an adapter of the infra implements it.",
    on: "import",
    check: ({ file, from, to, target }) => withinContext(from, to) && from.layer === "domain" && to.layer === "infra"
      && `The domain layer must not import the infra layer (${target}): the domain declares what it needs, and the infra implements it. Declare it as a port in ${contextFolderOf(file.path)}/domain/port/, and let a handler call the port and give the result to ${fileName(file.path).replace(/\.[^.]+$/, "")}.`
  },
  {
    name: "application-imports-no-presentation",
    description: "The application (the handlers and the DTOs of the use cases, and the events of the frontend) does not import the presentation: a controller, a view, a component or the store. The presentation sends the use cases their DTOs, and hears their events.",
    on: "import",
    check: ({ file, from, to, target }) => {
      if (!withinContext(from, to) || from.layer !== "application" || to.layer !== "presentation") return;
      const head = `The application layer must not import the presentation layer (${target}):`;
      if (from.side === "frontend") return `${head} the store and the views hear the use cases through events. Publish an event of ${from.context} instead, and let the store or the view hear it.`;
      const context = contextFolderOf(file.path);
      return `${head} the controller sends the use case its DTO, not the other way. ${from.useCase ? `Move what the handler needs into ${from.useCase.split("/")[1]}.dto.ts, or into ${context}/domain/.` : `Move what it needs into ${context}/domain/.`}`;
    }
  },
  {
    name: "application-imports-no-infra",
    description: "The application (the handlers and the DTOs of the use cases, and the events of the frontend) does not import the infra: a handler depends on a port of the domain, and di.ts binds the adapter.",
    on: "import",
    check: ({ from, to, target }, project) => {
      if (!withinContext(from, to) || from.layer !== "application" || to.layer !== "infra") return;
      const port = portOfAdapter(target, project);
      return `The application layer must not import the infra layer (${target}). Depend on its port${port ? `, ${port.name} (${port.path}),` : " in domain/port/"} instead, and bind the adapter in ${contextFolderOf(target)}/di.ts.`;
    }
  },
  {
    name: "presentation-imports-no-infra",
    description: "The presentation (a controller, or the presentation of the frontend) does not import the infra: it goes through a use case, whose handler depends on a port of the domain.",
    on: "import",
    check: ({ file, from, to, target }, project) => {
      if (!withinContext(from, to) || from.layer !== "presentation" || to.layer !== "infra") return;
      const port = portOfAdapter(target, project);
      const named = port ? `${port.name} (${port.path})` : "its port";
      if (from.side === "frontend") {
        return `The presentation layer must not import the infra layer (${target}): a view publishes events, and the handlers of the use cases call the ports. Publish an event of ${from.context}, let the store send the DTO of a use case, and let its handler depend on ${named}.`;
      }
      const context = contextFolderOf(file.path);
      const useCase = from.useCase?.split("/")[1];
      return `The presentation layer must not import the infra layer (${target}): a controller sends a DTO to its use case, and the handler uses the port. ${useCase ? `Send the DTO of ${useCase}, and let ${context}/${from.useCase}/${useCase}.handler.ts depend on ${named}` : `Send the DTO of its use case, and let the handler depend on ${named}`}; ${contextFolderOf(target)}/di.ts binds the adapter.`;
    }
  },
  {
    name: "infra-imports-no-presentation",
    description: "The infra does not import the presentation: an adapter implements a port of the domain, and knows neither the views, the components, the store nor the controllers.",
    on: "import",
    check: ({ file, from, to, target }) => withinContext(from, to) && from.layer === "infra" && to.layer === "presentation"
      && `The infra layer must not import the presentation layer (${target}): an adapter implements a port of the domain, and knows neither the views nor the controllers. Move what the adapter needs into ${contextFolderOf(file.path)}/domain/${from.side === "frontend" ? ", or the application of the frontend" : ""}.`
  },
  {
    name: "infra-imports-no-application",
    description: "In the backend, the infra does not import the application: an adapter implements a port, and the use cases call it. The infra of the frontend may import its application: its events and its DTOs.",
    on: "import",
    check: ({ file, from, to, target }) => withinContext(from, to) && from.side === "backend" && from.layer === "infra" && to.layer === "application"
      && `In the backend, the infra layer must not import the application layer (${target}): an adapter implements a port, and the use cases call it. Move what the adapter needs into ${contextFolderOf(file.path)}/domain/, such as a value object that the port takes.`
  },
  {
    name: "di-imports-no-application",
    description: "A di.ts does not import the application: it binds the ports of the domain to the adapters of the infra. The kernel finds the handlers and the DTOs by itself.",
    on: "import",
    check: ({ from, to, target }) => withinContext(from, to) && from.layer === "di" && to.layer === "application"
      && `di.ts must not import the application layer (${target}): it binds the ports of the domain to the adapters of the infra. Remove the import: the kernel finds the handlers and the DTOs in command/ and query/ by itself.`
  },
  {
    name: "di-imports-no-presentation",
    description: "A di.ts does not import the presentation: it binds the ports of the domain to the adapters of the infra. The kernel finds the controllers by itself, and the routes place the views.",
    on: "import",
    check: ({ from, to, target }) => withinContext(from, to) && from.layer === "di" && to.layer === "presentation"
      && `di.ts must not import the presentation layer (${target}): it binds the ports of the domain to the adapters of the infra. Remove the import: the kernel finds the controllers in command/ and query/ by itself, and the routes place the views.`
  },
  {
    name: "context-map-read-by-kernel",
    description: "No layer imports the context map of its context, or of shared. Only the kernel reads it: it shares the events of the context, and hears those of shared.",
    on: "import",
    check: ({ from, to, target }) => withinContext(from, to) && to.layer === "map"
      && `${subjectOf(from.layer ?? "")} imports ${target}, the context map of ${to.context}, but only the kernel reads a context map. Remove the import, publish an event of ${from.context}, and let the context map share it.`
  },
  {
    name: "contexts-without-routes",
    description: "A context does not import the routes. The routes use the contexts, not the opposite.",
    on: "import",
    check: ({ file, from, to, target }, { paths }) => {
      if (from.kind !== "layer" || to.kind !== "routes") return;
      return file.path.endsWith(".scss")
        ? `This stylesheet loads ${stylesheetOf(target, paths)}, a stylesheet of the routes, but the routes use the contexts, never the other way. Read the values of the theme as CSS variables instead.`
        : `The context ${from.context} imports ${target}, a route, but the routes use the contexts, never the other way. Move what it needs into ${contextFolderOf(file.path)}.`;
    }
  },

  // Routes: the pages and the handlers of Marko Run

  {
    name: "routes-folders",
    description: "src/routes holds only _frontend (the pages) and _backend (the HTTP handlers).",
    on: "file",
    check: ({ path }) => {
      if (!path.startsWith("src/routes/") || /^src\/routes\/_(frontend|backend)\//.test(path)) return;
      const rest = path.slice("src/routes/".length);
      const fix = /(^|\/)\+handler\.(js|ts)$/.test(path) ? `Move it to src/routes/_backend/${rest}.`
        : /(^|\/)\+(page|layout)\.marko$/.test(path) ? `Move it to src/routes/_frontend/${rest}.`
        : "Move a page or a layout to src/routes/_frontend/, and an HTTP handler to src/routes/_backend/.";
      return `${path} is outside _frontend and _backend, so it is on no side. ${fix}`;
    }
  },
  {
    name: "frontend-routes-content",
    description: "src/routes/_frontend holds the pages (+page.marko), the layouts (+layout.marko), in component/ the components of Marko that only these pages use and their stylesheets, in style/ the stylesheets (SCSS) of the app, and next to a page or a layout its stylesheet. A document that the pages give in another format than HTML (a sitemap, a feed, llms.txt) has its route as a page has: a folder named after its file, `sitemap.xml`/+handler.ts, which only gives the GET of a view of a frontend context. The routes hold no logic and no test: the code that a test reads lives in a context, with its test.",
    on: "file",
    check: ({ path }, { paths }) => {
      if (!path.startsWith("src/routes/_frontend/") || /\/\+(page|layout)\.marko$/.test(path) || /\/component\/[^/]+\.(marko|scss)$/.test(path)
        || /^src\/routes\/_frontend\/style\/([^/]+\/)*[^/]+\.scss$/.test(path)
        || (path.endsWith(".scss") && ["+page.marko", "+layout.marko"].some(name => paths.has(`${folderOf(path)}/${name}`)))
        || /\/`[\w-]+(\.[\w-]+)+`\/\+handler\.ts$/.test(path)) return;
      const relative = path.slice("src/routes/_frontend/".length);
      const [, before, name, after] = /^(.*?)`([^`]+)`(.*)$/.exec(relative) ?? [];
      if (name !== undefined && !name.includes(".")) {
        return `${relative} is not the route of a document: such a route is a folder named after its file, with its extension, and holds its +handler.ts. Name the folder after the file that it gives, as \`sitemap.xml\`/+handler.ts.`;
      }
      if (name !== undefined && !after.startsWith("/")) {
        return `${relative} is not the route of a document: such a route is a folder named after its file, with its +handler.ts. Move it to src/routes/_frontend/${before}\`${name}\`/+handler.ts.`;
      }
      if (path.endsWith(".scss")) return `${fileName(path)} is next to no page or layout, but a stylesheet of the routes is in style/, in component/, or next to its page. Move it to src/routes/_frontend/style/, or next to the page that uses it.`;
      if (path.endsWith(".marko")) return `${relative} is a template outside component/, but the routes hold their pages, their layouts, and in component/ the components that only their pages use. Move it to src/routes/_frontend/component/, or into a view of a frontend context.`;
      return `${relative} is ${path.endsWith(".test.ts") ? "a test" : "code"} in the routes, but the routes hold no logic and no test. Move it into a frontend context: the code into its layers, with its test, and let the page place the view that uses it.`;
    }
  },
  {
    name: "backend-routes-content",
    description: "src/routes/_backend holds only +handler.ts files. The code of a handler lives in a context: the route only gives the request to a controller.",
    on: "file",
    check: ({ path }) => path.startsWith("src/routes/_backend/") && !path.endsWith("/+handler.ts")
      && `${fileName(path)} is not a +handler.ts, but the backend routes only give the request to a controller. Move its code into a backend context, in a controller or a handler, and let the route import the controller.`
  },
  {
    name: "routes-on-their-side",
    description: "A frontend route imports only the frontend; a backend route imports only the backend.",
    on: "import",
    check: ({ from, to, target }) => {
      if (from.kind !== "routes" || to.kind !== "layer" || to.side === from.side) return;
      return from.side === "frontend"
        ? `This route of the frontend imports ${target}, a file of the backend, but the frontend and the backend are two projects, which talk only through the HTTP API. Place a view of a frontend context instead, which gets its data from the API through its adapter.`
        : `This route of the backend imports ${target}, a file of the frontend, but the frontend and the backend are two projects, which talk only through the HTTP API. Give the request to a controller of a backend context instead.`;
    }
  },
  {
    name: "routes-through-presentation",
    description: "A route imports only the presentation of the contexts of its side: the views for a page, the controllers for a handler.",
    on: "import",
    check: ({ from, to, target }, { files }) => {
      if (from.kind !== "routes" || to.kind !== "layer" || to.side !== from.side || to.layer === "presentation") return;
      const head = `This route imports ${target}, of ${objectOf(to.layer)} of ${to.context}, but a route reaches a context only through its presentation.`;
      if (from.side === "frontend") return `${head} Place a view of src/frontend/${to.context}/presentation/view/ instead.`;
      const folder = to.useCase && `src/backend/${to.context}/${to.useCase}/`;
      const controller = folder ? files.find(file => file.path.startsWith(folder) && file.path.endsWith(".controller.ts")) : undefined;
      const name = controller?.classes.find(({ exported }) => exported)?.name;
      return controller && name
        ? `${head} Import the controller of the use case, ${name} (${controller.path}), and give it the request: \`controller(${name}).handle(ctx.request)\`.`
        : `${head} Import the controller of the use case, and give it the request: \`controller(SomethingController).handle(ctx.request)\`.`;
    }
  },
  {
    name: "routes-take-no-frontend",
    description: "A route does not call frontendOf. It only places the views; each view takes the frontend of its context.",
    on: "file",
    production: true,
    check: file => locate(file.path).kind === "routes" && frontendCallsOf(file).map(({ context, line }) => at(line,
      `This route takes the frontend of ${context}, but a route only places views. Move the code into a view of src/frontend/${context}/presentation/view/, which takes its frontend with frontendOf, and place the view in the page.`))
  },

  // Test code: what the production code never imports

  {
    name: "production-imports-no-test-environment",
    description: "The production code does not import a test environment (test.di.ts). A test environment replaces dependencies in the tests only.",
    on: "import",
    check: ({ to, target }) => {
      if (to.kind !== "test-environment") return;
      const context = contextFolderOf(target);
      return `This file imports ${target}, the test environment of ${context ? context.split("/")[2] : "a context"}, but test.di.ts replaces dependencies in the tests only. Remove the import, and bind what the production code needs in ${context ? `${context}/di.ts` : "the di.ts of the context"}.`;
    }
  },
  {
    name: "production-imports-no-test-support",
    description: "The production code does not import the test support of the kernel (@ingenioz-it/caits/testing).",
    on: "import",
    check: ({ specifier }) => kernelPathOf(specifier)?.startsWith("testing/")
      && `This file imports ${specifier}, the test support of the kernel, but the production code never uses the tools of the tests. Move the code that needs it into a test.`
  },
  {
    name: "production-imports-only-src",
    description: "The production code in src imports no file outside src, test/ and quality/ included. It imports the kernel by its name, as a package, never by a path.",
    on: "import",
    check: ({ file, from, specifier, target }) => {
      if (!specifier.startsWith(".") || from.kind === "other" || target.startsWith("src/")) return;
      const kernel = /(^|\/)node_modules\/@ingenioz-it\/caits\/(.+)$/.exec(target)?.[2];
      if (kernel) return `This file imports ${target}, a file of the kernel, by its path. Import it by its name, @ingenioz-it/caits/${kernel.replace(/^src\//, "").replace(/\.(ts|js|mjs)$/, "")}.`;
      return `This file imports ${target}, outside src, but the production code imports nothing outside src: ${/^(test|quality)\//.test(target) ? "test/ and quality/ are" : "that folder is"} not part of the app. Move what it needs into ${contextFolderOf(file.path) ?? "src"}.`;
    }
  },

  // Exceptions: they live in quality/, never in the code

  {
    name: "exceptions-in-quality",
    description: "The code turns off no check: no comment that turns off a rule of ESLint (eslint-disable…), an error of TypeScript (@ts-ignore, @ts-expect-error, @ts-nocheck), lines of the coverage (v8 ignore, c8 ignore, istanbul ignore) or mutants (Stryker disable), and no test that does not run, runs alone or may fail (skip, skipIf, runIf, only, fails, fail, fixme). An exception lives in quality/, as narrow as it can be: a rule of ESLint turned off for one file in quality/eslint.config.js, a file out of the coverage in quality/vite.config.ts, a file out of the mutants in quality/stryker.config.mjs, a rule of quality/architecture.mjs that leaves one file aside.",
    on: "file",
    /** The comments that turn off a check: ESLint, TypeScript, the coverage (V8, c8, istanbul) and Stryker. */
    comments: /^[\s*]*(?:eslint-(?:disable|enable)|eslint-env\s|eslint\s+[@\w/-]+\s*:|@ts-(?:ignore|expect-error|nocheck)\b|(?:v8|c8|istanbul|node:coverage)\s+(?:ignore|disable)\b|[Ss]tryker\s+(?:disable|restore)\b)/,
    /** Where the exception of each tool lives, by the start of its comment. */
    fixes: [
      [/^[\s*]*eslint/, "Fix the code, or turn the rule off for this file only in quality/eslint.config.js."],
      [/^[\s*]*@ts-/, "Fix the type."],
      [/^[\s*]*(?:v8|c8|istanbul|node:coverage)/, "Test these lines, or leave this file out of the coverage in quality/vite.config.ts."],
      [/^[\s*]*[Ss]tryker/, "Kill the mutant with a test, or leave this file out of the mutants in quality/stryker.config.mjs."]
    ],
    /** The functions of Vitest and Playwright that keep a test from running, or from failing: what each one does. */
    skips: new Map([
      ["skip", "keeps the test from running"], ["skipIf", "keeps the test from running"], ["runIf", "keeps the test from running"], ["fixme", "keeps the test from running"],
      ["only", "keeps the other tests from running"], ["fails", "lets the test pass when it fails"], ["fail", "lets the test pass when it fails"]
    ]),
    testFunctions: new Set(["test", "it", "describe", "suite"]),
    /** @this {{ comments: RegExp; fixes: [RegExp, string][]; skips: Map<string, string>; testFunctions: Set<string> }} */
    check(file) {
      return [
        ...file.comments.flatMap((comment, index) => this.comments.test(comment) ? [at(file.lines.comments[index],
          `This comment turns off a check, \`${comment.trim()}\`, so the exception hides in the code. ${this.fixes.find(([start]) => start.test(comment))?.[1] ?? this.fixes[0][1]}`)] : []),
        ...file.calls.flatMap(({ name, root, line }) => name === null || root === null || name === root || !this.skips.has(name) || !this.testFunctions.has(root) ? [] : [at(line,
          `\`${root}.${name}\` ${this.skips.get(name)}, but every test runs, every time, and passes. Remove .${name}${name === "only" ? "" : ", and fix the test or the code"}.`)])
      ];
    }
  }
];
