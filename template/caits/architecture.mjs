import { adapterOf, frontendsOf, givesSharedTags, importedModules, isCore, isMarko, isNode, isPackage, isTestCode, kebab, kernelPathOf, linesOf, locate, portOf, resolveImport, typeOfEvent } from "@ingenioz-it/caits/quality/architecture";

/** @import { Rule } from "@ingenioz-it/caits/quality/architecture" */

/**
 * The rules of the architecture, by layer. Each rule has a name and a description, reads one kind of thing (`on`), and checks it:
 * the check gives nothing when the rule holds, else what is wrong, as a message or a list of messages.
 * - on "import": each import of the production code, as { file, from, to, specifier, internal, target } (from and to: see locate).
 *   The rules on imports do not overlap: an import breaks two of them only when it has two problems.
 * - on "file": each file, with the project ({ root, files, paths }); `production: true` leaves the test code aside.
 * - on "project": the project once; the check gives a list of { file, message }.
 * @type {Rule[]}
 */
export const rules = [
  // Kernel: the package @ingenioz-it/caits builds the containers and the controllers

  {
    name: "container-built-by-kernel",
    description: "Only the kernel makes a Container. A context does not build its dependencies: its di.ts gives the bindings, and the kernel builds them.",
    on: "file",
    check: ({ constructed }) => constructed.includes("Container")
      && "only the kernel builds a container: a context says in its di.ts what each token stands for"
  },
  {
    name: "controllers-built-by-kernel",
    description: "Only the kernel makes a controller, with its dependencies. The other code asks the kernel for a controller, or sends a request through the router.",
    on: "file",
    check: ({ constructed }) => {
      const controller = constructed.find(name => name !== null && /^[A-Z]\w*Controller$/.test(name));
      return controller && `only the kernel builds a controller: ask the kernel for it, or send a request through the router (new ${controller}(…))`;
    }
  },

  // Domain: entities, value objects, errors, events and ports

  {
    name: "domain-shape",
    description: "The domain of a context holds only entities, value objects, errors, domain events and ports. Each kind of file has its folder and its name pattern.",
    on: "file",
    check: ({ path }) => /^src\/(backend|frontend)\/[^/]+\/domain\//.test(path)
      && !/^src\/(backend|frontend)\/[^/]+\/domain\/((entity|value-object)\/[A-Z]\w*(\.test)?|error\/[A-Z]\w*Error|event\/[A-Z]\w*|port\/[a-z0-9-]+\/[A-Z]\w*?(\.contract)?)\.ts$/.test(path)
      && "domain holds only entity/{Entity}.ts and its test, value-object/{ValueObject}.ts and its test, error/{Name}Error.ts, event/{DomainEvent}.ts, port/{port}/{Port}.ts and port/{port}/{Port}.contract.ts"
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
      return (names.length !== exports.length || new Set(names).size !== 1) && `a domain file exports one name: a port and its token share it (found ${exports.length} exports)`;
    }
  },
  {
    name: "entity-is-class",
    description: "An entity or a value object is an exported class. The class holds the business rules of its values.",
    on: "file",
    check: ({ path, classes }) => /^src\/(backend|frontend)\/[^/]+\/domain\/(entity|value-object)\/[A-Z]\w*\.ts$/.test(path) && !classes.some(({ exported }) => exported)
      && "an entity or a value object is a class"
  },
  {
    name: "error-extends-error",
    description: "A domain error is an exported class …Error that extends Error.",
    on: "file",
    check: ({ path, classes }) => /^src\/(backend|frontend)\/[^/]+\/domain\/error\/[A-Z]\w*Error\.ts$/.test(path)
      && !classes.some(({ exported, name, extends: parent }) => exported && name !== null && /^\w+Error$/.test(name) && parent === "Error")
      && "an error is a class that extends Error"
  },
  {
    name: "port-folder-named-after-port",
    description: "The folder of a port has the name of the port in kebab-case: the port NoteRepository is in port/note-repository/. Its adapters use the same folder name in the infra.",
    on: "file",
    check: ({ path }) => {
      const port = portOf(path);
      return port && kebab(port.name) !== port.folder && `the folder of port ${port.name} is port/${kebab(port.name)}/`;
    }
  },
  {
    name: "port-has-contract",
    description: "Each port has a contract test, {Port}.contract.ts, next to it. The contract says what every adapter of the port must do.",
    on: "file",
    check: ({ path }, { paths }) => {
      const port = portOf(path);
      return port && !port.contract && !paths.has(`${port.module}.contract.ts`) && `a port has a contract: domain/port/${port.folder}/${port.name}.contract.ts`;
    }
  },
  {
    name: "contract-next-to-port",
    description: "A contract test is in domain/port/{port}/, next to the port that it describes.",
    on: "file",
    check: ({ path }) => path.endsWith(".contract.ts") && !portOf(path) && "a contract test describes a port: it lives in domain/port/, next to the port"
  },
  {
    name: "contract-runs-in-adapter-test",
    description: "The test of at least one adapter runs each contract. A contract that no test runs checks nothing.",
    on: "file",
    check: ({ path }, { files, root }) => {
      const port = portOf(path);
      return port?.contract && !files.some(file => adapterOf(file.path)?.test && importedModules(file, root).includes(`${port.module}.contract`))
        && "a contract is run by the test of at least one adapter (in the context's infra)";
    }
  },
  {
    name: "core-without-node",
    description: "The domain and the application (the handlers and the DTOs of the use cases, and the events of the frontend) do not import Node APIs (node:*). Node APIs are technology: they stay in the infra.",
    on: "import",
    check: ({ from, specifier }) => isCore(from) && isNode(specifier) && "domain and application stay free of Node APIs"
  },
  {
    name: "domain-uses-kernel-primitives",
    description: "The domain imports only the files at the root of the kernel (@ingenioz-it/caits/Result, /Token, /DomainEvent). It does not import the buses, the store or the DI of the kernel.",
    on: "import",
    check: ({ from, specifier }) => from.layer === "domain" && kernelPathOf(specifier)?.includes("/")
      && "the domain imports only the kernel's domain primitives, never buses or the store"
  },
  {
    name: "entity-without-port",
    description: "An entity or a value object does not import a port. It holds the business rules; the handlers call the ports.",
    on: "import",
    check: ({ file, from, target }) => from.layer === "domain" && /\/domain\/(entity|value-object)\//.test(file.path) && /\/domain\/port\//.test(target)
      && "an entity or a value object holds business rules: it never talks to a port, the handlers orchestrate"
  },

  // Use cases: one folder each, in command/ or query/, with its DTOs, its handler, its controllers and their tests

  {
    name: "backend-use-case-shape",
    description: "A use case of a backend context has its folder, command/{usecase}/ or query/{usecase}/, which holds all of it: its DTOs, its handler and its test, {usecase}.application.test.ts, and its controllers, {usecase}.{name}.controller.ts, each with its test, {usecase}.{name}.presentation.test.ts. An endpoint lives in one folder, and the name of each test says the layer that it tests.",
    on: "file",
    check: ({ path }) => /^src\/backend\/[^/]+\/(command|query)\//.test(path)
      && !/^src\/backend\/[^/]+\/(command|query)\/([a-z0-9-]+)\/\2(\.(handler|dto|application\.test)|\.[a-z0-9-]+\.(controller|presentation\.test))\.ts$/.test(path)
      && "a use case holds only {usecase}.dto.ts, {usecase}.handler.ts, {usecase}.application.test.ts, and its controllers {usecase}.{name}.controller.ts with their tests {usecase}.{name}.presentation.test.ts, in command/{usecase}/ or query/{usecase}/"
  },
  {
    name: "frontend-use-case-shape",
    description: "A use case of a frontend context has its folder, command/{usecase}/ or query/{usecase}/, with its DTOs, its handler and its test, {usecase}.application.test.ts. The store sends its input DTOs: a use case of the frontend has no controller.",
    on: "file",
    check: ({ path }) => /^src\/frontend\/[^/]+\/(command|query)\//.test(path) && !/^src\/frontend\/[^/]+\/(command|query)\/([a-z0-9-]+)\/\2\.(handler|dto|application\.test)\.ts$/.test(path)
      && "a use case of the frontend holds only {usecase}.dto.ts, {usecase}.handler.ts and {usecase}.application.test.ts in command/{usecase}/ or query/{usecase}/: the store sends its DTOs"
  },
  {
    name: "use-cases-isolated",
    description: "A use case imports nothing from another use case, of its context or of the context shared: each one holds all that it needs, and what two use cases share lives in the domain. Thus a use case changes, and goes, alone.",
    on: "import",
    check: ({ from, to }) => from.useCase && to.useCase && to.side === from.side && (to.context === from.context || to.context === "shared")
      && (to.context !== from.context || to.useCase !== from.useCase)
      && `a use case imports nothing from another use case (${to.useCase}): what two use cases share lives in the domain`
  },
  {
    name: "handler-answers-output",
    description: "A backend handler gives its result as an Output DTO: it makes a `new …Output(…)`.",
    on: "file",
    check: ({ path, constructed }) => /^src\/backend\/[^/]+\/(command|query)\/[^/]+\/[^/]+\.handler\.ts$/.test(path) && !constructed.some(name => name !== null && /^\w+Output$/.test(name))
      && "a handler answers with `new SomethingOutput(…)`"
  },
  {
    name: "controller-extends-controller",
    description: "A controller is an exported class …Controller that extends the Controller of the kernel.",
    on: "file",
    check: ({ path, classes }) => /^src\/backend\/[^/]+\/(command|query)\/[^/]+\/[^/]+\.controller\.ts$/.test(path)
      && !classes.some(({ exported, name, extends: parent }) => exported && name !== null && /^\w+Controller$/.test(name) && parent === "Controller")
      && "a controller is an exported class …Controller that extends the kernel's Controller"
  },

  // Events of the frontend: what its views, its handlers and its context map publish

  {
    name: "frontend-event-shape",
    description: "The events of a frontend context are in event/, one file per event: event/{Event}.ts.",
    on: "file",
    check: ({ path }) => /^src\/frontend\/[^/]+\/event\//.test(path) && !/^src\/frontend\/[^/]+\/event\/[A-Z]\w*\.ts$/.test(path)
      && "the events of a frontend context are in event/, one file per event: event/{Event}.ts"
  },
  {
    name: "event-file-exports-its-event",
    description: "A frontend event file exports one name only: the event, with the name of the file.",
    on: "file",
    check: ({ path, exports }) => {
      const event = /^src\/frontend\/[^/]+\/event\/(\w+)\.ts$/.exec(path)?.[1];
      if (!event) return;
      if (exports.length !== 1) return `an event file has exactly one export (found ${exports.length})`;
      return (exports[0].name !== event || !["class", "type"].includes(exports[0].kind)) && `event/${event}.ts exports ${event}`;
    }
  },
  {
    name: "event-type-names-context",
    description: "A frontend event class has `readonly type = \"{context}.{event}\" as const`. The store reads this type: the context, then the name of the event without the context, in kebab-case.",
    on: "file",
    check: ({ path, classes }) => {
      const [, context, event] = /^src\/frontend\/([^/]+)\/event\/(\w+)\.ts$/.exec(path) ?? [];
      const declared = event && classes.find(({ exported, name }) => exported && name === event);
      if (!context || !declared) return;
      const type = typeOfEvent(context, event);
      const property = declared.properties.find(({ name }) => name === "type");
      return (!property?.readonly || !property.asConst || property.value !== type) && `the type of ${event} is "${type}": its context, then its name without the context`;
    }
  },

  // Presentation: the views, the components and the store of the frontend; the controllers live in their use cases

  {
    name: "frontend-presentation-shape",
    description: "The presentation of a frontend context holds only its views (one folder per view), its components (one folder per component: what its views share), its store and the type of its frontend. The pages are in the routes.",
    on: "file",
    check: ({ path }) => /^src\/frontend\/[^/]+\/presentation\//.test(path)
      && !/^src\/frontend\/[^/]+\/presentation\/((view|component)\/[a-z0-9-]+\/[^/]+|store\/[a-z]\w*Store\.ts|[A-Z]\w*Frontend\.ts)$/.test(path)
      && "a frontend presentation holds only view/{view}/ with the files that only this View uses, component/{component}/ with the files of a component that its views share, store/{context}Store.ts, {Context}Frontend.ts: the pages live in the routes"
  },
  {
    name: "zod-in-presentation",
    description: "Only the presentation (the controllers of the use cases, and the presentation of the frontend) imports zod. zod checks the data that comes from HTTP; the other layers get typed values.",
    on: "import",
    check: ({ from, specifier }) => isPackage(specifier, "zod") && (isCore(from) || (from.kind === "layer" && from.layer !== "presentation"))
      && "zod stays at the transport boundary (presentation)"
  },
  {
    name: "marko-in-frontend-presentation",
    description: "Only the frontend presentation and the routes import Marko. The other layers stay free of the view technology.",
    on: "import",
    check: ({ from, specifier }) => isMarko(specifier) && from.kind === "layer" && !(from.side === "frontend" && from.layer === "presentation")
      && "Marko lives in frontend presentation and routes only"
  },
  {
    name: "dtos-sent-by-store",
    description: "In the frontend, only the store and the application (the use cases and the events) import the input DTOs. A view publishes events; the store turns them into DTOs and sends them to the message bus.",
    on: "import",
    check: ({ file, target }) => /^src\/frontend\/[^/]+\/(command|query)\/.+\.dto\.(js|ts)$/.test(target) && !/^src\/frontend\/[^/]+\/(presentation\/store|command|query|event)\//.test(file.path)
      && "in the frontend, only the store sends input DTOs to the message bus: a view publishes events, and the store turns them into DTOs"
  },
  {
    name: "events-built-with-new",
    description: "In the frontend, the code makes an event with `new SomeEvent(…)`, not as an object literal `{ type: \"…\" }`. The class gives the correct type and the correct data.",
    on: "file",
    check: ({ path, objectTypes }) => {
      const type = /^src\/(frontend|routes\/_frontend)\//.test(path) && objectTypes.find(value => /^[a-z]+\.[a-z-]+$/.test(value));
      return type && `an event of the frontend is built with \`new SomeEvent(…)\`, not as an object literal ({ type: "${type}" })`;
    }
  },
  {
    name: "views-take-own-frontend",
    description: "A view or a component takes only the frontend of its own context, with frontendOf. The contexts of the frontend do not share their frontends, not even the one of shared: to tell the other contexts, a view publishes an event of its context, and the context map shares it as an event of shared.",
    on: "file",
    production: true,
    check: file => {
      const where = locate(file.path);
      return where.kind === "layer" && where.side === "frontend"
        && frontendsOf(file).filter(context => context !== where.context)
          .map(context => `a context takes only its own frontend (${where.context}), not the one of ${context}: to tell the other contexts, its context map shares an event of its own`);
    }
  },
  {
    name: "components-import-no-view",
    description: "A component of the frontend (presentation/component/) is a part of the views: it imports no view, of its context or of the context shared. It may take the frontend of its context, publish its events and read its store, as a view does.",
    on: "import",
    check: ({ file, target }) => /^src\/frontend\/[^/]+\/presentation\/component\//.test(file.path) && /^src\/frontend\/[^/]+\/presentation\/view\//.test(target)
      && "a component imports no view: the routes place the views, and the views place the components"
  },
  {
    name: "views-import-no-view",
    description: "A view of the frontend imports nothing from another view. What views share is a component (presentation/component/); the routes place the views side by side.",
    on: "import",
    check: ({ file, target }) => {
      const view = /^src\/frontend\/([^/]+)\/presentation\/view\/([^/]+)\//.exec(file.path);
      const other = /^src\/frontend\/([^/]+)\/presentation\/view\/([^/]+)\//.exec(target);
      return view && other && view[1] === other[1] && view[2] !== other[2]
        && `a view imports no other view (${other[2]}): what views share is a component, in presentation/component/`;
    }
  },

  // Infra: the adapters of the ports

  {
    name: "backend-infra-shape",
    description: "The infra of a backend context holds only adapters: infra/{port}/{implementation}-{port}.ts and their tests.",
    on: "file",
    check: ({ path }) => /^src\/backend\/[^/]+\/infra\//.test(path) && !/^src\/backend\/[^/]+\/infra\/([a-z0-9-]+)\/[a-z0-9-]+-\1(\.test)?\.ts$/.test(path)
      && "infra holds only {port}/{implementation}-{port}.ts and its test"
  },
  {
    name: "infra-folder-implements-port",
    description: "Each folder of infra/ is for a port that the domain declares: infra/{port}/ goes with domain/port/{port}/.",
    on: "file",
    check: ({ path }, { paths }) => {
      const adapter = adapterOf(path);
      return adapter && !paths.has(`${adapter.portModule}.ts`) && `infra/${adapter.folder}/ implements a port: the domain must declare port/${adapter.port}`;
    }
  },
  {
    name: "adapter-implements-port",
    description: "An adapter in infra/{port}/ implements the port of its folder (`implements Port`).",
    on: "file",
    check: ({ path, classes }, { paths }) => {
      const adapter = adapterOf(path);
      return adapter && !adapter.test && paths.has(`${adapter.portModule}.ts`) && !classes.some(declared => declared.implements.includes(adapter.port))
        && `an adapter of infra/${adapter.folder}/ implements the port ${adapter.port}`;
    }
  },
  {
    name: "adapter-test-runs-contract",
    description: "The test of an adapter runs the contract of its port. Thus all the adapters of a port do the same things.",
    on: "file",
    check: (file, { paths, root }) => {
      const adapter = adapterOf(file.path);
      return adapter?.test && paths.has(`${adapter.portModule}.ts`) && !importedModules(file, root).includes(`${adapter.portModule}.contract`)
        && `the test of an adapter runs the contract of its port (${adapter.port}.contract)`;
    }
  },

  // di.ts: the bindings of a context

  {
    name: "di-holds-bindings",
    description: "A di.ts or a test.di.ts has one export, a list of bindings: `export default [bind(Port).to(Adapter), …]`. It builds nothing: the kernel reads the list and builds the dependencies.",
    on: "file",
    methods: new Set(["to", "toValue", "toFactory", "with"]),
    /** @this {{ methods: Set<string> }} */
    check({ path, exports, defaultArray }) {
      if (!/^src\/(backend|frontend)\/[^/]+\/(test\.)?di\.ts$/.test(path)) return;
      if (exports.length !== 1 || !defaultArray) return "a di.ts has one export: `export default [bind(Port).to(Adapter), …]`";
      const others = defaultArray.filter(({ chain: [first, ...methods] }) => first !== "bind" || methods.length === 0 || !methods.every(method => this.methods.has(method)));
      return others.length > 0 && `a di.ts holds bindings only: bind(Port).to(Adapter) (${others.map(({ source }) => source).join("; ")})`;
    }
  },
  {
    name: "di-read-by-kernel",
    description: "No layer imports the di.ts of a context. Only the kernel reads it.",
    on: "import",
    check: ({ from, to }) => from.kind === "layer" && to.layer === "di" && "a context's di.ts is read by the kernel only"
  },

  // Contexts: their folders, and what their layers import

  {
    name: "sides-hold-contexts",
    description: "src/backend and src/frontend hold only the contexts: a context map goes in its context. src/backend holds the integration tests of the whole backend too (*.integration.test.ts).",
    on: "file",
    check: ({ path }) => {
      const [, side, inside] = /^src\/(backend|frontend)\/([^/]+)$/.exec(path) ?? [];
      return side && (side === "frontend" || !/^[\w.-]+\.integration\.test\.ts$/.test(inside))
        && `src/${side} holds only the contexts${side === "backend" ? ", and the integration tests of the whole backend (*.integration.test.ts)" : ""}: a context map goes in its context`;
    }
  },
  {
    name: "context-content",
    description: "A context holds its domain, its infra, and its use cases in command/ and query/: a use case holds its controllers. A context of the frontend holds its events too, in event/, and its presentation, in presentation/: its views, its components and its store serve several use cases. A context holds also its di.ts and its test.di.ts (and its package.json, which gives the shortcut #context), and its context map, context-map.ts and its test: the events of the context shared that it hears, and the events of its own that it shares.",
    on: "file",
    folders: { backend: ["domain", "infra", "command", "query"], frontend: ["domain", "infra", "command", "query", "event", "presentation"] },
    /** @this {{ folders: Record<string, string[]> }} */
    check({ path }) {
      const [, side, inside] = /^src\/(backend|frontend)\/[^/]+\/(.+)$/.exec(path) ?? [];
      const folders = side && this.folders[side];
      return folders && !folders.some(folder => inside.startsWith(`${folder}/`)) && !/^(di|test\.di|context-map(\.test)?)\.ts$/.test(inside)
        && `a context of the ${side} holds only ${folders.slice(0, -1).join(", ")} and ${folders[folders.length - 1]}, with its di.ts, its test.di.ts and its context-map.ts`;
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
      return !reads && (side === "backend"
        ? "a context map translates between the events of shared and those of its context, which it turns into its inputs: it imports only events, the input DTOs of its context, and the values of the domain"
        : "a context map translates between the events of shared and those of its context: it imports only events, and the values of the domain");
    }
  },
  {
    name: "context-map-holds-lines",
    description: "A context map has one export, the list of its lines: `export default [when(Event, event => […]), share(Event, event => […])]`. It takes when and share from the kernel, for its side: @ingenioz-it/caits/messaging/ContextMap in the backend, @ingenioz-it/caits/messaging/FrontendContextMap in the frontend. The kernel reads the list.",
    on: "file",
    modules: { backend: "@ingenioz-it/caits/messaging/ContextMap", frontend: "@ingenioz-it/caits/messaging/FrontendContextMap" },
    /** @this {{ modules: Record<string, string> }} */
    check({ path, exports, defaultArray, imported }) {
      const side = /^src\/(backend|frontend)\/[^/]+\/context-map\.ts$/.exec(path)?.[1];
      if (!side) return;
      if (exports.length !== 1 || !defaultArray) return "a context map has one export, its lines: `export default [when(Event, event => […]), share(Event, event => […])]`";
      const module = this.modules[side];
      return [
        ...defaultArray.filter(({ chain }) => chain.length !== 1 || (chain[0] !== "when" && chain[0] !== "share"))
          .map(({ source }) => `a context map lists its lines, each made with when(Event, event => […]) or share(Event, event => […]): ${source}`),
        ...imported.filter(({ name, from }) => (name === "when" || name === "share") && from !== module)
          .map(({ name, from }) => `a context map of the ${side} takes ${name} from ${module}, not from ${from}`)
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
      return linesOf(file, root).flatMap(({ shares, event, gives }) => {
        const wrongStart = event && !event.module.startsWith(shares ? own : shared)
          ? [shares
            ? `share(${event.name}, …) starts from an event of its context, which ${side === "backend" ? "a handler" : "a view"} publishes: ${event.name} ${event.module.startsWith(shared) ? "is an event of shared, which when(…) hears" : "is not one"}`
            : `when(${event.name}, …) starts from an event of shared, which comes on the shared bus: ${event.name} ${event.module.startsWith(own) ? "is an event of its context, which share(…) shares" : "is not one"}`]
          : [];
        const wrongGives = gives.filter(({ module }) => isMessage(module) && !(shares ? module.startsWith(shared) : reacts(module)))
          .map(({ name }) => shares ? `share(…) gives events of shared: ${name} is not one` : `when(…) gives ${side === "backend" ? "input DTOs" : "events"} of its context: ${name} is not one`);
        return [...wrongStart, ...wrongGives];
      });
    }
  },
  {
    name: "context-maps-without-cycle",
    description: "In the frontend, a bus carries an event at once: a line when(Shared, …) that gives Own, and a line share(Own, …) that gives Shared, would carry them without end, and the page would stop. The context maps of the frontend make no cycle of events, in one map or across several. In the backend, a cycle goes through a handler, which the maps do not show.",
    on: "project",
    check({ files, root }) {
      /** @type {Map<string, { to: string; map: string }[]>} */
      const edges = new Map();
      /** @type {(module: string) => boolean} */
      const isShared = module => module.startsWith("src/frontend/shared/");
      for (const file of files) {
        if (!/^src\/frontend\/[^/]+\/context-map\.ts$/.test(file.path)) continue;
        for (const { event, gives } of linesOf(file, root)) {
          if (!event) continue;
          // An event goes from shared to the context, or from the context to shared: a line that goes otherwise never starts.
          for (const { module } of gives.filter(given => /^src\/frontend\/[^/]+\/event\//.test(given.module) && isShared(given.module) !== isShared(event.module))) {
            edges.set(event.module, [...edges.get(event.module) ?? [], { to: module, map: file.path }]);
          }
        }
      }
      /** @type {Map<string, { file: string; message: string }>} */
      const cycles = new Map();
      /** @type {(path: { module: string; map: string }[]) => void} */
      const follow = path => {
        for (const { to, map } of edges.get(path[path.length - 1].module) ?? []) {
          const steps = [...path.slice(1), { module: to, map }];
          if (to === path[0].module) {
            const first = steps.reduce((least, step, index) => step.module < steps[least].module ? index : least, 0);
            const cycle = [...steps.slice(first), ...steps.slice(0, first)];
            const names = [...cycle, cycle[0]].map(({ module }) => module.split("/").pop());
            cycles.set(names.join(" → "), { file: cycle[0].map, message: `the context maps make a cycle, which the buses would carry without end: ${names.join(" → ")}` });
          } else if (!path.some(step => step.module === to)) follow([...path, { module: to, map }]);
        }
      };
      for (const module of edges.keys()) follow([{ module, map: "" }]);
      return [...cycles.values()];
    }
  },
  {
    name: "shared-events-in-map",
    description: "A context talks to the other contexts only through its context map: a handler (in the frontend, also a view or a component) publishes an event of its context, the map shares it as an event of shared on the shared bus, and the map of each context that hears it turns it into what its context reacts to. Thus, in a context other than shared, only the context map imports the events of shared: those of the backend, in domain/event/, and those of the frontend, in event/.",
    on: "import",
    // The layers that could import them, but the context map; layer-direction refuses the others already.
    events: {
      backend: { folder: /^src\/backend\/shared\/domain\/event\//, layers: ["domain", "application", "infra", "presentation", "di"], publisher: "a handler" },
      frontend: { folder: /^src\/frontend\/shared\/event\//, layers: ["application", "infra", "presentation"], publisher: "a view" }
    },
    /** @this {{ events: Record<string, { folder: RegExp; layers: string[]; publisher: string }> }} */
    check({ from, target }) {
      const events = from.kind === "layer" && from.context !== "shared" && this.events[from.side];
      return events && events.layers.includes(from.layer) && events.folder.test(target)
        && `in the ${from.side}, only the context map imports the events of shared: ${events.publisher} publishes an event of its context, and the map shares it as an event of shared`;
    }
  },
  {
    name: "shared-hears-no-context",
    description: "The context shared, in the backend and in the frontend, has no context map: it hears no other context, and its events are on the shared bus already. The contexts hear it.",
    on: "file",
    check: ({ path }) => /^src\/(backend|frontend)\/shared\/context-map\.ts$/.test(path) && "the context shared hears no other context: it has no context map"
  },
  {
    name: "context-has-di",
    description: "Each folder of src/backend and src/frontend is a context, and has a di.ts. The kernel finds the contexts by their di.ts.",
    on: "project",
    check: ({ paths }) => {
      const contexts = new Set([...paths].map(path => /^src\/(backend|frontend)\/[^/]+(?=\/)/.exec(path)?.[0]).filter(context => context !== undefined));
      return [...contexts].filter(context => !paths.has(`${context}/di.ts`))
        .map(context => ({ file: context, message: `a folder of ${context.split("/").slice(0, 2).join("/")} is a context: it says in di.ts what each of its tokens stands for` }));
    }
  },
  {
    name: "shared-components-are-tags",
    description: "A component of the frontend context shared is a Marko tag: its folder holds its index.marko, and src/frontend/marko.json gives Marko the folder of these tags, { \"tags-dir\": \"./shared/presentation/component\" }. A context places it by its name, <badge>: Marko finds it, where an import of its file would not build.",
    on: "project",
    check: ({ root, paths }) => {
      const folders = new Set([...paths].map(path => /^src\/frontend\/shared\/presentation\/component\/[a-z0-9-]+(?=\/)/.exec(path)?.[0]).filter(folder => folder !== undefined));
      const untagged = [...folders].filter(folder => !paths.has(`${folder}/index.marko`))
        .map(folder => ({ file: folder, message: `a component of the frontend context shared is a Marko tag, which its index.marko holds: ${folder}/index.marko` }));
      return folders.size > 0 && !givesSharedTags(root)
        ? [...untagged, { file: "src/frontend/marko.json", message: 'the components of the frontend context shared are Marko tags: src/frontend/marko.json gives Marko their folder, { "tags-dir": "./shared/presentation/component" }' }]
        : untagged;
    }
  },
  {
    name: "shared-components-placed-by-tag",
    description: "A context of the frontend places a component of the context shared by its tag (<badge>), and does not import its file: Marko reads an import of a template from the package.json of the context, whose shortcuts lead only into it.",
    on: "import",
    check: ({ from, specifier, target }) => from.kind === "layer" && from.context !== "shared" && specifier.startsWith("#")
      && /^src\/frontend\/shared\/presentation\/component\/[a-z0-9-]+\/[^/]+\.marko$/.test(target)
      && `a context places a component of shared by its tag, <${target.split("/")[5]}>: Marko does not build an import of its file`
  },
  {
    name: "imports-by-shortcut",
    description: "In src, an import does not go up a folder (../). A context imports its own files with #context/, and the context shared of its side with #shared/ in the backend, #frontend-shared/ in the frontend; a route imports the contexts with #backend/ and #frontend/. Thus an import does not change when its file moves. A stylesheet loads only the files of its folder: Sass reads # as the start of a fragment, and a view reads the values of the theme as CSS variables.",
    on: "file",
    check: ({ path, imports }) => path.startsWith("src/")
      && imports.filter(specifier => specifier.split("/").includes(".."))
        .map(specifier => path.endsWith(".scss")
          ? `a stylesheet does not go up a folder: it loads the files of its folder, and a view reads the values of the theme as CSS variables (${specifier})`
          : `an import does not go up a folder: use #context/ in a context, #shared/ or #frontend-shared/ for shared, #backend/ or #frontend/ in a route (${specifier})`)
  },
  {
    name: "contexts-isolated",
    description: "A context does not import another context of its side, except the context shared of its side. The contexts talk through the shared bus: the context map of a context shares an event of the context as an event of shared, and the context map of each context that hears it turns it into what it reacts to, input DTOs of its own in the backend, events of its own in the frontend. In the frontend, a route places the views of several contexts side by side.",
    on: "import",
    check: ({ from, to }) => from.kind === "layer" && to.kind === "layer" && to.side === from.side && to.layer !== "di" && to.context !== from.context && to.context !== "shared"
      && (from.side === "backend"
        ? "a context never imports another context: its context map shares an event of its own as an event of shared, and the context map of each context that hears it turns it into inputs of its own"
        : "a context never imports another context: in the frontend, its context map shares an event of its own as an event of shared, and the context map of each context that hears it turns it into its own events")
  },
  {
    name: "tests-in-one-context",
    description: "A test reads one context, and the context shared of its side: a test in a context reads only its context, and a test out of the contexts (src/backend/*.integration.test.ts, test/) one context at most. No test crosses contexts: each context is tested alone, and its context map on its own lines, what it shares and what it does with an event of shared. A test of the frontend builds only the frontend of its context, with testPresentation.",
    on: "file",
    check: (file, { root }) => {
      if (!isTestCode(file.path)) return;
      const [source, side, context, ...rest] = file.path.split("/");
      const own = source === "src" && (side === "backend" || side === "frontend") && rest.length > 0 ? `${side}/${context}` : undefined;
      const read = new Set([
        ...file.imports.map(specifier => resolveImport(file.path, specifier, root))
          .flatMap(({ internal, target }) => internal && /^src\/(backend|frontend)\/[^/]+\/./.test(target) ? [target.split("/").slice(1, 3).join("/")] : []),
        ...file.calls.flatMap(({ name, args: [built] }) => name === "testPresentation" && typeof built === "string" ? [`frontend/${built}`] : [])
      ]);
      if (own) {
        const others = [...read].filter(name => name !== own && name !== `${side}/shared`);
        return others.length > 0
          && `a test of ${own} reads only its context and shared, not ${others.join(", ")}: each context is tested alone, and its context map on what it shares and what it does with an event of shared`;
      }
      const sides = new Set([...read].map(name => name.split("/")[0]));
      return ([...read].filter(name => !name.endsWith("/shared")).length > 1 || sides.size > 1)
        && `a test reads one context at most, and the context shared of its side: this one reads ${[...read].join(", ")}. Each context is tested alone`;
    }
  },
  {
    name: "sides-apart",
    description: "A frontend context and a backend context do not import each other. They are two projects: they talk only through the HTTP API.",
    on: "import",
    check: ({ from, to }) => from.kind === "layer" && to.kind === "layer" && to.side !== from.side
      && "frontend and backend never import each other: they are two projects, which talk only through the HTTP API"
  },
  {
    name: "layer-direction",
    description: "In a context, and from a context to shared, each layer imports only the layers that it may use. The domain imports the domain; the application (the handlers and the DTOs of the use cases, and the events of the frontend) adds the domain; the presentation (the controllers of the use cases, and the presentation/ of the frontend) adds the application; the infra imports the domain (and the application in the frontend); the di.ts imports the domain and the infra; the context map imports the application and the domain. No layer imports the context map: the kernel reads it.",
    on: "import",
    allowed: {
      backend: { domain: ["domain"], application: ["application", "domain"], presentation: ["presentation", "application", "domain"], infra: ["infra", "domain"], di: ["domain", "infra"], map: ["application", "domain"] },
      frontend: { domain: ["domain"], application: ["application", "domain"], presentation: ["presentation", "application", "domain"], infra: ["infra", "application", "domain"], di: ["domain", "infra"], map: ["application", "domain"] }
    },
    /** @this {{ allowed: Record<string, Record<string, string[]>> }} */
    check({ from, to }) {
      return from.kind === "layer" && to.kind === "layer" && to.side === from.side && to.layer !== "di" && (to.context === from.context || to.context === "shared")
        && !this.allowed[from.side][from.layer]?.includes(to.layer) && `${from.layer} must not depend on ${to.layer}`;
    }
  },
  {
    name: "contexts-without-routes",
    description: "A context does not import the routes. The routes use the contexts, not the opposite.",
    on: "import",
    check: ({ from, to }) => from.kind === "layer" && to.kind === "routes" && "contexts never import routes"
  },

  // Routes: the pages and the handlers of Marko Run

  {
    name: "routes-folders",
    description: "src/routes holds only _frontend (the pages) and _backend (the HTTP handlers).",
    on: "file",
    check: ({ path }) => path.startsWith("src/routes/") && !/^src\/routes\/_(frontend|backend)\//.test(path) && "routes holds only _frontend and _backend"
  },
  {
    name: "frontend-routes-content",
    description: "src/routes/_frontend holds the pages (+page.marko), the layouts (+layout.marko), in component/ the components of Marko that only these pages use and their stylesheets, in style/ the stylesheets (SCSS) of the app, and next to a page or a layout its stylesheet. A document that the pages give in another format than HTML (a sitemap, a feed, llms.txt) has its route as a page has: a folder named after its file, `sitemap.xml`/+handler.ts, which only gives the GET of a view of a frontend context. The routes hold no logic and no test: the code that a test reads lives in a context, with its test.",
    on: "file",
    check: ({ path }, { paths }) => path.startsWith("src/routes/_frontend/") && !/\/\+(page|layout)\.marko$/.test(path) && !/\/component\/[^/]+\.(marko|scss)$/.test(path)
      && !/^src\/routes\/_frontend\/style\/([^/]+\/)*[^/]+\.scss$/.test(path)
      && !(path.endsWith(".scss") && ["+page.marko", "+layout.marko"].some(name => paths.has(`${path.slice(0, path.lastIndexOf("/"))}/${name}`)))
      && !/\/`[\w-]+(\.[\w-]+)+`\/\+handler\.ts$/.test(path)
      && "routes/_frontend holds +page.marko, +layout.marko, in component/ the components of Marko that only its pages use and their stylesheets, in style/ the stylesheets of the app, next to a page or a layout its stylesheet, and in a folder named after its file the route of a document (`sitemap.xml`/+handler.ts): the code that a test reads, and its test, live in a context"
  },
  {
    name: "backend-routes-content",
    description: "src/routes/_backend holds only +handler.ts files. The code of a handler lives in a context: the route only gives the request to a controller.",
    on: "file",
    check: ({ path }) => path.startsWith("src/routes/_backend/") && !path.endsWith("/+handler.ts") && "routes/_backend holds only +handler.ts: the rest lives in a context"
  },
  {
    name: "routes-on-their-side",
    description: "A frontend route imports only the frontend; a backend route imports only the backend.",
    on: "import",
    check: ({ from, to }) => from.kind === "routes" && to.kind === "layer" && to.side !== from.side
      && "frontend and backend never import each other: they are two projects, which talk only through the HTTP API"
  },
  {
    name: "routes-through-presentation",
    description: "A route imports only the presentation of the contexts of its side: the views for a page, the controllers for a handler.",
    on: "import",
    check: ({ from, to }) => from.kind === "routes" && to.kind === "layer" && to.side === from.side && to.layer !== "presentation" && "routes reach contexts through presentation"
  },
  {
    name: "routes-take-no-frontend",
    description: "A route does not call frontendOf. It only places the views; each view takes the frontend of its context.",
    on: "file",
    production: true,
    check: file => locate(file.path).kind === "routes"
      && frontendsOf(file).map(context => `a route takes no frontend: the views of a context take theirs with frontendOf (${context})`)
  },

  // Test code: what the production code never imports

  {
    name: "no-test-environment",
    description: "The production code does not import a test environment (test.di.ts). A test environment replaces dependencies in the tests only.",
    on: "import",
    check: ({ to }) => to.kind === "test-environment" && "production code never imports a test environment (test.di)"
  },
  {
    name: "no-test-support",
    description: "The production code does not import the test support of the kernel (@ingenioz-it/caits/testing).",
    on: "import",
    check: ({ specifier }) => kernelPathOf(specifier)?.startsWith("testing/") && "production code never imports test support (@ingenioz-it/caits/testing)"
  },
  {
    name: "nothing-outside-src",
    description: "The production code in src imports no file outside src, test/ and quality/ included. It imports the kernel by its name, as a package, never by a path.",
    on: "import",
    check: ({ from, specifier, target }) => specifier.startsWith(".") && from.kind !== "other" && !target.startsWith("src/")
      && "production code (src) never imports a file outside src, tests included; it imports the kernel by its name (@ingenioz-it/caits/…)"
  },

  // Exceptions: they live in quality/, never in the code

  {
    name: "exceptions-in-quality",
    description: "The code turns off no check: no comment that turns off a rule of ESLint (eslint-disable…), an error of TypeScript (@ts-ignore, @ts-expect-error, @ts-nocheck), lines of the coverage (v8 ignore, c8 ignore, istanbul ignore) or mutants (Stryker disable), and no test that does not run, runs alone or may fail (skip, skipIf, runIf, only, fails, fail, fixme). An exception lives in quality/, as narrow as it can be: a rule of ESLint turned off for one file in quality/eslint.config.js, a file out of the coverage in quality/vite.config.ts, a file out of the mutants in quality/stryker.config.mjs, a rule of quality/architecture.mjs that leaves one file aside.",
    on: "file",
    /** The comments that turn off a check: ESLint, TypeScript, the coverage (V8, c8, istanbul) and Stryker. */
    comments: /^[\s*]*(?:eslint-(?:disable|enable)|eslint-env\s|eslint\s+[@\w/-]+\s*:|@ts-(?:ignore|expect-error|nocheck)\b|(?:v8|c8|istanbul|node:coverage)\s+(?:ignore|disable)\b|[Ss]tryker\s+(?:disable|restore)\b)/,
    /** The functions of Vitest and Playwright that keep a test from running, or from failing. */
    skips: new Set(["skip", "skipIf", "runIf", "only", "fails", "fail", "fixme"]),
    testFunctions: new Set(["test", "it", "describe", "suite"]),
    /** @this {{ comments: RegExp; skips: Set<string>; testFunctions: Set<string> }} */
    check(file) {
      return [
        ...file.comments.filter(comment => this.comments.test(comment))
          .map(comment => `a comment turns off a check (${comment.trim()}): fix the code, or write the exception in quality/, for this file only`),
        ...file.calls.filter(({ name, root }) => name !== null && root !== null && name !== root && this.skips.has(name) && this.testFunctions.has(root))
          .map(({ name, root }) => `${root}.${name} keeps tests from running, or from failing: every test runs, every time, and passes`)
      ];
    }
  }
];
