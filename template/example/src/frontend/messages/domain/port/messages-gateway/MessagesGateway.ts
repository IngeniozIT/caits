import { Token } from "@ingeniozit/caits/Token";
import type { Message } from "#context/domain/entity/Message.js";

/** The way to the messages of the server. A refusal of the server is an error that carries the reason. */
export interface MessagesGateway {
  list(): Promise<Message[]>;
  add(text: string): Promise<void>;
  edit(id: string, text: string): Promise<void>;
  remove(id: string): Promise<void>;
}

export const MessagesGateway = new Token<MessagesGateway>();
