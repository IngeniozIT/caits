import { Token } from "../Token.js";

/** What the backend knows of the request that a handler or a controller serves. */
export type RequestContext = { readonly correlationId: string };

export const RequestContext = new Token<RequestContext>();
