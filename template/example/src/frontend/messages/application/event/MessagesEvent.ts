import type { MessageAdditionRequested } from "./MessageAdditionRequested.js";
import type { MessageEditionRequested } from "./MessageEditionRequested.js";
import type { MessageRemovalRequested } from "./MessageRemovalRequested.js";
import type { MessagesChanged } from "./MessagesChanged.js";
import type { MessagesChangeFailed } from "./MessagesChangeFailed.js";
import type { MessagesLoaded } from "./MessagesLoaded.js";
import type { MessagesLoadFailed } from "./MessagesLoadFailed.js";
import type { MessagesRequested } from "./MessagesRequested.js";

/** The events of the context: the store reads them all. */
export type MessagesEvent =
  | MessagesRequested | MessagesLoaded | MessagesLoadFailed
  | MessageAdditionRequested | MessageEditionRequested | MessageRemovalRequested | MessagesChanged | MessagesChangeFailed;
