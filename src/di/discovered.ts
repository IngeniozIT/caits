/// <reference path="../virtual-modules.d.ts" />
import { bindings, dtos, handlers, controllers, map } from "virtual:kernel/backend";
import { discover } from "./discover.js";

/** Every context of the backend: its di.ts, its use cases and its controllers, and the context map. The plugin of the kernel finds them. */
export const discovered = discover({ bindings, dtos, handlers, controllers, map });
