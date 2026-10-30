import { Token } from "../Token.js";

/** What goes with an input DTO: the signal of its request, which aborts when its client leaves. Its handler reads it in its RequestContext. */
export type Sending = { readonly signal?: AbortSignal };

/**
 * Where a controller or a store sends an input DTO: the message bus gives it to the handler of its class, and gives back the output of
 * the handler.
 */
export interface MessageBus {
  send(input: object, sending?: Sending): Promise<unknown>;
}

export const MessageBus = new Token<MessageBus>();
