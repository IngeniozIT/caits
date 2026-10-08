import { bind } from "@ingeniozit/caits/di/Container";
import { MessageRepository } from "./domain/port/message-repository/MessageRepository.js";
import { InMemoryMessageRepository } from "./infra/message-repository/in-memory-message-repository.js";

/** The dependencies of the tests: they replace those of di.ts. */
export default [
  bind(MessageRepository).to(InMemoryMessageRepository)
];
