import { Token } from "../Token.js";

/**
 * Where a controller or a store sends an input DTO: the message bus gives it to the handler of its class, and gives back the output of
 * the handler.
 */
export interface MessageBus {
  send(input: object): Promise<unknown>;
}

export const MessageBus = new Token<MessageBus>();
