import { Token } from "../Token.js";

/** Reports a failure that nobody waits for: a reaction to an event, or an error that a controller hides from its client. */
export type ReportError = (error: unknown) => void;

export const ReportError = new Token<ReportError>();

/** Where a failure goes when nobody says where: the console. */
export const reportToConsole: ReportError = error => { console.error(error); };
