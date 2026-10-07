import { Token } from "../Token.js";

/** Reports a failure that nobody waits for: a reaction to an event, or an error that a controller hides from its client. */
export type ReportError = (error: unknown) => void;

export const ReportError = new Token<ReportError>();
