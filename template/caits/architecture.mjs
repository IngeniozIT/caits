import { adapterOf, frontendsOf, importedModules, isCore, isMarko, isNode, isPackage, kebab, kernelPathOf, locate, portOf, typeOfEvent } from "@ingenioz-it/caits/quality/architecture";

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
    description: "The domain and the application do not import Node APIs (node:*). Node APIs are technology: they stay in the infra.",
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
    description: "An entity or a value object does not import a port. It holds the business rules; the application calls the ports.",
    on: "import",
    check: ({ file, from, target }) => from.layer === "domain" && /\/domain\/(entity|value-object)\//.test(file.path) && /\/domain\/port\//.test(target)
      && "an entity or a value object holds business rules: it never talks to a port, the application orchestrates"
  },

  // Application: the use cases, and the events of the frontend

  {
    name: "backend-application-shape",
    description: "The application of a backend context holds only use cases. Each use case has its folder, command/{usecase}/ or query/{usecase}/, with its handler, its DTOs and its test.",
    on: "file",
    check: ({ path }) => /^src\/backend\/[^/]+\/application\//.test(path) && !/^src\/backend\/[^/]+\/application\/(command|query)\/([a-z0-9-]+)\/\2\.(handler|dto|test)\.ts$/.test(path)
      && "application holds only {usecase}.handler.ts, {usecase}.dto.ts and {usecase}.test.ts in command/{usecase}/ or query/{usecase}/"
  },
  {
    name: "handler-answers-output",
    description: "A backend handler gives its result as an Output DTO: it makes a `new …Output(…)`.",
    on: "file",
    check: ({ path, constructed }) => /^src\/backend\/[^/]+\/application\/.+\.handler\.ts$/.test(path) && !constructed.some(name => name !== null && /^\w+Output$/.test(name))
      && "a handler answers with `new SomethingOutput(…)`"
  },
  {
    name: "frontend-application-shape",
    description: "The application of a frontend context holds its use cases, as in the backend, and its events, one file per event in event/.",
    on: "file",
    check: ({ path }) => /^src\/frontend\/[^/]+\/application\//.test(path)
      && !/^src\/frontend\/[^/]+\/application\/((command|query)\/([a-z0-9-]+)\/\3\.(handler|dto|test)|event\/[A-Z]\w*)\.ts$/.test(path)
      && "a frontend application holds only {usecase}.handler.ts, {usecase}.dto.ts and {usecase}.test.ts in command/{usecase}/ or query/{usecase}/ and event/{Event}.ts"
  },
  {
    name: "event-file-exports-its-event",
    description: "A frontend event file exports one name only: the event, with the name of the file.",
    on: "file",
    check: ({ path, exports }) => {
      const event = /^src\/frontend\/[^/]+\/application\/event\/(\w+)\.ts$/.exec(path)?.[1];
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
      const [, context, event] = /^src\/frontend\/([^/]+)\/application\/event\/(\w+)\.ts$/.exec(path) ?? [];
      const declared = event && classes.find(({ exported, name }) => exported && name === event);
      if (!context || !declared) return;
      const type = typeOfEvent(context, event);
      const property = declared.properties.find(({ name }) => name === "type");
      return (!property?.readonly || !property.asConst || property.value !== type) && `the type of ${event} is "${type}": its context, then its name without the context`;
    }
  },

  // Presentation: the controllers of the backend, the views and the stores of the frontend

  {
    name: "backend-presentation-shape",
    description: "The presentation of a backend context holds only controllers, each in its folder {name}/ with its test.",
    on: "file",
    check: ({ path }) => /^src\/backend\/[^/]+\/presentation\//.test(path) && !/^src\/backend\/[^/]+\/presentation\/([a-z0-9-]+)\/\1\.(controller|test)\.ts$/.test(path)
      && "presentation holds only {name}/{name}.controller.ts and {name}/{name}.test.ts"
  },
  {
    name: "controller-extends-controller",
    description: "A controller is an exported class …Controller that extends the Controller of the kernel.",
    on: "file",
    check: ({ path, classes }) => /^src\/backend\/[^/]+\/presentation\/.+\.controller\.ts$/.test(path)
      && !classes.some(({ exported, name, extends: parent }) => exported && name !== null && /^\w+Controller$/.test(name) && parent === "Controller")
      && "a controller is an exported class …Controller that extends the kernel's Controller"
  },
  {
    name: "frontend-presentation-shape",
    description: "The presentation of a frontend context holds only its views (one folder per view), its store and the type of its frontend. The pages are in the routes.",
    on: "file",
    check: ({ path }) => /^src\/frontend\/[^/]+\/presentation\//.test(path)
      && !/^src\/frontend\/[^/]+\/presentation\/(view\/[a-z0-9-]+\/[^/]+|store\/[a-z]\w*Store\.ts|[A-Z]\w*Frontend\.ts)$/.test(path)
      && "a frontend presentation holds only view/{view}/ with the files that only this View uses, store/{context}Store.ts, {Context}Frontend.ts: the pages live in the routes"
  },
  {
    name: "zod-in-presentation",
    description: "Only the presentation imports zod. zod checks the data that comes from HTTP; the other layers get typed values.",
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
    description: "In the frontend, only the store and the application import the input DTOs. A view publishes events; the store turns them into DTOs and sends them to the message bus.",
    on: "import",
    check: ({ file, target }) => /^src\/frontend\/[^/]+\/application\/.+\.dto\.(js|ts)$/.test(target) && !/^src\/frontend\/[^/]+\/(presentation\/store|application)\//.test(file.path)
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
    description: "A view takes only the frontend of its own context, with frontendOf. The contexts of the frontend do not share their frontends.",
    on: "file",
    production: true,
    check: file => {
      const where = locate(file.path);
      return where.kind === "layer" && where.side === "frontend"
        && frontendsOf(file).filter(context => context !== where.context).map(context => `a context takes only its own frontend (${where.context}), not the one of ${context}`);
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
    description: "src/backend holds only the contexts and the context map (context-map.ts and its tests). src/frontend holds only the contexts.",
    on: "file",
    check: ({ path }) => {
      const [, side, inside] = /^src\/(backend|frontend)\/([^/]+)$/.exec(path) ?? [];
      return side && (side === "frontend" || !/^context-map(\.test|\.integration\.test)?\.ts$/.test(inside))
        && `src/${side} holds only the contexts${side === "backend" ? " and the context map (context-map.ts and its tests)" : ""}`;
    }
  },
  {
    name: "context-content",
    description: "A context holds only its four layers (domain, application, infra, presentation), its di.ts and its test.di.ts (and its package.json, which gives the shortcut #context).",
    on: "file",
    check: ({ path }) => /^src\/(backend|frontend)\/[^/]+\//.test(path) && !/^src\/(backend|frontend)\/[^/]+\/((domain|application|infra|presentation)\/|(di|test\.di)\.ts$)/.test(path)
      && "a context holds only domain, application, infra and presentation, with its di.ts and test.di.ts"
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
    name: "imports-by-shortcut",
    description: "In src, an import does not go up a folder (../). A context imports its own files with #context/ and the context shared with #shared/; a route imports the contexts with #backend/ and #frontend/. Thus an import does not change when its file moves. A stylesheet loads only the files of its folder: Sass reads # as the start of a fragment, and a View reads the values of the theme as CSS variables.",
    on: "file",
    check: ({ path, imports }) => path.startsWith("src/")
      && imports.filter(specifier => specifier.split("/").includes(".."))
        .map(specifier => path.endsWith(".scss")
          ? `a stylesheet does not go up a folder: it loads the files of its folder, and a View reads the values of the theme as CSS variables (${specifier})`
          : `an import does not go up a folder: use #context/ in a context, #shared/ for shared, #backend/ or #frontend/ in a route (${specifier})`)
  },
  {
    name: "contexts-isolated",
    description: "A context does not import another context of its side, except the backend context shared. Backend contexts talk through events and the context map; frontend contexts do not talk: a route places their views side by side.",
    on: "import",
    check: ({ from, to }) => from.kind === "layer" && to.kind === "layer" && to.side === from.side && to.layer !== "di" && to.context !== from.context && to.context !== "shared"
      && (from.side === "backend"
        ? "a context never imports another context: it publishes events, and the context map turns them into the inputs of the others"
        : "a context never imports another context: in the frontend, a route places the views of several contexts side by side")
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
    description: "In a context, and from a context to shared, each layer imports only the layers that it may use. The domain imports the domain; the application adds the domain; the presentation adds the application; the infra imports the domain (and the application in the frontend); the di.ts imports the domain and the infra.",
    on: "import",
    allowed: {
      backend: { domain: ["domain"], application: ["application", "domain"], presentation: ["presentation", "application", "domain"], infra: ["infra", "domain"], di: ["domain", "infra"] },
      frontend: { domain: ["domain"], application: ["application", "domain"], presentation: ["presentation", "application", "domain"], infra: ["infra", "application", "domain"], di: ["domain", "infra"] }
    },
    /** @this {{ allowed: Record<string, Record<string, string[]>> }} */
    check({ from, to }) {
      return from.kind === "layer" && to.kind === "layer" && to.side === from.side && to.layer !== "di" && (to.context === from.context || to.context === "shared")
        && !this.allowed[from.side][from.layer]?.includes(to.layer) && `${from.layer} must not depend on ${to.layer}`;
    }
  },
  {
    name: "contexts-without-routes",
    description: "A context does not import the routes or the context map. The routes and the context map use the contexts, not the opposite.",
    on: "import",
    check: ({ from, to }) => from.kind === "layer" && (to.kind === "routes" || to.kind === "map") && "contexts never import routes or the context map"
  },

  // Context map: src/backend/context-map.ts, which turns the events of a context into the inputs of the others

  {
    name: "context-map-reads-events-and-dtos",
    description: "The context map imports from the contexts only their domain events and their input DTOs. It turns an event of a context into the input of another context.",
    on: "import",
    check: ({ from, to, target }) => from.kind === "map" && to.kind === "layer" && !/\/domain\/event\/[^/]+$|\.dto\.(js|ts)$/.test(target)
      && "the context map reads only the events (domain/event) and the input DTOs (*.dto.ts) of the contexts"
  },
  {
    name: "context-map-without-routes",
    description: "The context map does not import the routes.",
    on: "import",
    check: ({ from, to }) => from.kind === "map" && to.kind === "routes" && "the context map never imports routes"
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
    description: "src/routes/_frontend holds the pages (+page.marko), the layouts (+layout.marko), in component/ the components that only these pages use, in style/ the stylesheets (SCSS) of the app, and next to a page or a layout its stylesheet.",
    on: "file",
    check: ({ path }, { paths }) => path.startsWith("src/routes/_frontend/") && !/\/\+(page|layout)\.marko$/.test(path) && !/\/component\/[^/]+$/.test(path)
      && !/^src\/routes\/_frontend\/style\/([^/]+\/)*[^/]+\.scss$/.test(path)
      && !(path.endsWith(".scss") && ["+page.marko", "+layout.marko"].some(name => paths.has(`${path.slice(0, path.lastIndexOf("/"))}/${name}`)))
      && "routes/_frontend holds +page.marko, +layout.marko, in component/ the components that only its pages use, in style/ the stylesheets of the app, and next to a page or a layout its stylesheet"
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
    name: "routes-without-context-map",
    description: "A route does not import the context map. The kernel reads it.",
    on: "import",
    check: ({ from, to }) => from.kind === "routes" && to.kind === "map" && "routes never import the context map: the kernel reads it"
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
  }
];
