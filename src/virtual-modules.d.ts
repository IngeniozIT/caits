/** The modules of the kernel's Vite plugin (vite.js): the files of the contexts, by their path from the root of the project. */
declare module "virtual:kernel/backend" {
  import type { Binding } from "@ingenioz-it/caits/di/Container";
  import type { Translation } from "@ingenioz-it/caits/messaging/ContextMap";
  type Modules = Record<string, Record<string, unknown>>;
  export const bindings: Record<string, readonly Binding[]>;
  export const dtos: Modules;
  export const handlers: Modules;
  export const controllers: Modules;
  export const map: Record<string, Translation[]>;
}

declare module "virtual:kernel/backend-test" {
  import type { Binding } from "@ingenioz-it/caits/di/Container";
  export const bindings: Record<string, readonly Binding[]>;
}

declare module "virtual:kernel/frontend" {
  import type { Binding } from "@ingenioz-it/caits/di/Container";
  import type { StoreDefinition } from "@ingenioz-it/caits/state/createStore";
  type Modules = Record<string, Record<string, unknown>>;
  export const bindings: Record<string, readonly Binding[]>;
  export const dtos: Modules;
  export const handlers: Modules;
  export const stores: Record<string, StoreDefinition<unknown, unknown>>;
}

declare module "virtual:kernel/frontend-test" {
  import type { Binding } from "@ingenioz-it/caits/di/Container";
  export const bindings: Record<string, readonly Binding[]>;
}

declare module "virtual:marko-run/__marko-run__router.js";
