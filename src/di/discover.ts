import type { Translation } from "../messaging/ContextMap.js";
import { Input } from "../messaging/Input.js";
import type { Binding } from "./Container.js";

export type Class = abstract new (...args: never[]) => unknown;
export type UseCase = { readonly input: Class; readonly handler: Class };
export type ContextModules = { bindings: readonly Binding[]; useCases: UseCase[]; controllers: Class[] };
export type BackendModules = { shared: readonly Binding[]; contexts: Record<string, ContextModules>; map: Translation[] };

type Modules = Record<string, Record<string, unknown>>;

const contextOf = (path: string) => /backend\/([^/]+)\//.exec(path)![1];
export const classesOf = (module: Record<string, unknown>) => Object.values(module).filter((value): value is Class => typeof value === "function");

export function single<T>(found: T[], what: string): T {
  if (found.length !== 1) throw new Error(`${what} (found ${found.length})`);
  return found[0];
}

/** Turns the modules found in the backend folder (src/backend by default) into the contexts of the backend: a handler serves the input DTO of its use-case folder. */
export function discover(found: { bindings: Record<string, readonly Binding[]>; dtos: Modules; handlers: Modules; controllers: Modules; map: Record<string, Translation[]> }): BackendModules {
  const contexts: Record<string, ContextModules> = {};
  const context = (path: string) => contexts[contextOf(path)] ??= { bindings: [], useCases: [], controllers: [] };
  let shared: readonly Binding[] = [];

  for (const [path, bindings] of Object.entries(found.bindings)) {
    if (contextOf(path) === "shared") shared = bindings;
    else context(path).bindings = bindings;
  }
  for (const [path, module] of Object.entries(found.handlers)) {
    const dto = path.replace(".handler.ts", ".dto.ts");
    const input = single(classesOf(found.dtos[dto] ?? {}).filter(type => type.prototype instanceof Input), `${dto} declares one input DTO`);
    const handler = single(classesOf(module), `${path} declares one handler`);
    context(path).useCases.push({ input, handler });
  }
  for (const [path, module] of Object.entries(found.controllers)) context(path).controllers.push(...classesOf(module));

  return { shared, contexts, map: Object.values(found.map)[0] ?? [] };
}
