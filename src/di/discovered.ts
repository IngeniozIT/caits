/// <reference path="../virtual-modules.d.ts" />
import { bindings, dtos, handlers, controllers, maps } from "virtual:kernel/backend";
import { discover } from "./discover.js";

/** Every context of the backend: its di.ts, its use cases, its controllers and its context map. The plugin of the kernel finds them. */
export const discovered = discover({ bindings, dtos, handlers, controllers, maps });
