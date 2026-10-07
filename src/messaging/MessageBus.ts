import { Token } from "../Token.js";
import type { Input } from "./Input.js";

/**
 * Where a controller or a store sends an input DTO: the message bus gives it to the handler of its class, and gives back the output of
 * the handler.
 */
export interface MessageBus {
  send<Output>(input: Input<Output>): Promise<Output>;
}

export const MessageBus = new Token<MessageBus>();
