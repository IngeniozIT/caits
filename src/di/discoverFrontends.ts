import { Input } from "../messaging/Input.js";
import type { StoreDefinition } from "../state/createStore.js";
import type { Binding } from "./Container.js";
import { classesOf, single, type UseCase } from "./discover.js";

export type FrontendModules = { bindings: readonly Binding[]; useCases: UseCase[]; store: StoreDefinition<unknown, unknown> };

type Modules = Record<string, Record<string, unknown>>;

const contextOf = (path: string) => /frontend\/([^/]+)\//.exec(path)![1];

/**
 * Turns the modules found in the frontend folder (src/frontend by default) into the contexts of the frontend: a context has a di.ts and a store,
 * and a handler serves the input DTO of its use-case folder.
 */
export function discoverFrontends(found: {
  bindings: Record<string, readonly Binding[]>;
  dtos: Modules;
  handlers: Modules;
  stores: Record<string, StoreDefinition<unknown, unknown>>;
}): Record<string, FrontendModules> {
  const contexts: Record<string, FrontendModules> = {};
  for (const [path, bindings] of Object.entries(found.bindings)) {
    const name = contextOf(path);
    const store = single(Object.entries(found.stores).filter(([storePath]) => contextOf(storePath) === name).map(([, definition]) => definition), `the frontend ${name} declares one store in presentation/store/`);
    contexts[name] = { bindings, useCases: [], store };
  }
  for (const [path, module] of Object.entries(found.handlers)) {
    const context = contexts[contextOf(path)];
    if (!context) throw new Error(`${path} belongs to a frontend without a di.ts`);
    const dto = path.replace(".handler.ts", ".dto.ts");
    const input = single(classesOf(found.dtos[dto] ?? {}).filter(type => type.prototype instanceof Input), `${dto} declares one input DTO`);
    context.useCases.push({ input, handler: single(classesOf(module), `${path} declares one handler`) });
  }
  return contexts;
}
