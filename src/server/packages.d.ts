/** The packages that the entry of the server (entry.ts) uses as the entry of @marko/run does. CAITS depends on them, as @marko/run does: they have no types. */
declare module "compression" {
  import type { IncomingMessage, ServerResponse } from "node:http";
  type Options = { readonly flush?: number; readonly threshold?: number };
  export default function compression(options?: Options): (request: IncomingMessage, response: ServerResponse, next: () => void) => void;
}

declare module "serve-static" {
  import type { IncomingMessage, ServerResponse } from "node:http";
  type Options = { readonly index?: false; readonly redirect?: boolean; readonly maxAge?: string; readonly immutable?: boolean; readonly fallthrough?: boolean };
  export default function serveStatic(root: string, options?: Options): (request: IncomingMessage, response: ServerResponse, next: () => void) => void;
}
