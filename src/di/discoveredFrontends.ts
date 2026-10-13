/// <reference path="../virtual-modules.d.ts" />
import { bindings, dtos, handlers, maps, stores } from "virtual:kernel/frontend";
import { discoverFrontends } from "./discoverFrontends.js";

/** Every context of the frontend: its di.ts, its use cases, its store and its context map. The plugin of the kernel finds them. */
export const discoveredFrontends = discoverFrontends({ bindings, dtos, handlers, stores, maps });
