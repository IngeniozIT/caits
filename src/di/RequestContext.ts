import { Token } from "../Token.js";

/**
 * What the backend knows of the request that a handler or a controller serves: its correlation id, and its signal, which aborts when its
 * client leaves. A handler gives the signal to the ports whose work the client waits for: a call to a model, to a service, to a database.
 * A request without a client sees the backend stop: the signal of a turn of a timer aborts as soon as the server stops, that of a reaction
 * to an event once the grace of the server ends. A DTO that the backend sends without a signal, as a test does, gets one that does not
 * abort.
 */
export type RequestContext = { readonly correlationId: string; readonly signal: AbortSignal };

export const RequestContext = new Token<RequestContext>();
