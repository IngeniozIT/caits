import type { Translation } from "../messaging/ContextMap.js";
import { Input } from "../messaging/Input.js";
import type { Binding } from "./Container.js";

export type Class = abstract new (...args: never[]) => unknown;
export type UseCase = { readonly input: Class; readonly handler: Class };
/**
 * A context of the backend: its bindings, its use cases, its controllers, and its context map: the events of shared that it hears, and
 * the events of its own that it shares.
 */
export type ContextModules = { bindings: readonly Binding[]; useCases: UseCase[]; controllers: Class[]; map: Translation[] };
export type BackendModules = { shared: readonly Binding[]; contexts: Record<string, ContextModules> };

type Modules = Record<string, Record<string, unknown>>;

const contextOf = (path: string) => /backend\/([^/]+)\//.exec(path)![1];
export const classesOf = (module: Record<string, unknown>) => Object.values(module).filter((value): value is Class => typeof value === "function");

export function single<T>(found: T[], what: string): T {
  if (found.length !== 1) throw new Error(`${what} (found ${found.length})`);
  return found[0];
}

/**
 * The lines of a context map, as its file gives them: the kernel refuses, when it starts, a map that is not a list of lines, rather than
 * lose what it holds without a word. `isLine` tells a line of the side.
 */
export function linesIn<L>(path: string, map: unknown, isLine: (line: Partial<Record<string, unknown>>) => boolean, kernel: string): L[] {
  const refused = (what: string) => new Error(`${path} lists the lines of its context map, export default [when(…), share(…)], made with ${kernel}: ${what}`);
  if (!Array.isArray(map)) throw refused(`${JSON.stringify(map) ?? typeof map} is not a list`);
  for (const line of map as unknown[]) {
    if (!isLine(line ?? {})) throw refused(`${JSON.stringify(line) ?? typeof line} is not a line`);
  }
  return map as L[];
}

/** A line of a backend context map: one that hears gives inputs, one that shares gives events. */
const isTranslation = ({ shares, event, inputs, events }: Partial<Record<string, unknown>>) =>
  typeof event === "function" && (shares === false ? typeof inputs === "function" : shares === true && typeof events === "function");

/**
 * Turns the modules found in the backend folder (src/backend by default) into the contexts of the backend: a handler serves the input
 * DTO of its use-case folder, and the context map of a context gives the events of shared that it hears and those of its own that it
 * shares.
 */
export function discover(found: { bindings: Record<string, readonly Binding[]>; dtos: Modules; handlers: Modules; controllers: Modules; maps: Record<string, Translation[]> }): BackendModules {
  const contexts: Record<string, ContextModules> = {};
  const context = (path: string) => contexts[contextOf(path)] ??= { bindings: [], useCases: [], controllers: [], map: [] };
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
  for (const [path, map] of Object.entries(found.maps)) {
    if (contextOf(path) === "shared") throw new Error(`the backend context shared hears no other context: it has no context map (${path})`);
    context(path).map = linesIn(path, map, isTranslation, "@ingenioz-it/caits/messaging/ContextMap");
  }

  return { shared, contexts };
}
