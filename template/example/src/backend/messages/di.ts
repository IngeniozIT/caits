import { bind } from "@ingeniozit/caits/di/Container";
import { DataDirectory } from "@ingeniozit/caits/di/DataDirectory";
import { MessageRepository } from "./domain/port/message-repository/MessageRepository.js";
import { FileMessageRepository } from "./infra/message-repository/file-message-repository.js";

/**
 * The dependencies of the context, in production. The messages go in the file tmp/messages.json, or in the folder DATA_DIR when it is
 * set. When a second context keeps files, the binding of DataDirectory moves to src/backend/shared/di.ts.
 */
export default [
  bind(MessageRepository).to(FileMessageRepository).with({ fileName: "messages.json" }),
  bind(DataDirectory).toFactory(() => process.env.DATA_DIR ?? "tmp")
];
