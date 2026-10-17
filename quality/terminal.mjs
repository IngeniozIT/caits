// The colors of the outputs of CAITS. A tool prints its lines through the painter of its stream: in a terminal, the painter colors the
// parts of a line; in a pipe or a file (an AI agent, a log), it gives the text as it is, without a code. NO_COLOR turns the colors off,
// FORCE_COLOR turns them on, as for the other tools. Each kind of line has its colors: caits.dev shows the outputs with the same ones.
import { styleText } from "node:util";

/** @typedef {"bold" | "dim" | "red" | "green" | "yellow" | "cyan"} Style */
/** Gives the text with the styles, or as it is. @typedef {(style: Style | Style[], text: string) => string} Paint */

/**
 * The painter of a stream: it colors when the stream is a terminal, or when FORCE_COLOR asks for colors, and never with NO_COLOR.
 * @param {NodeJS.WriteStream} stream
 * @returns {Paint}
 */
export const painterOf = stream => (style, text) => styleText(style, text, { stream });

/** The painter of a text without colors. @type {Paint} */
export const plain = (_style, text) => text;

/** Whether a painter colors. @type {(paint: Paint) => boolean} */
export const colors = paint => paint("bold", "x") !== "x";

/**
 * A command, then what it does, after two spaces or more: the command in cyan. A line without an explanation is all command.
 * @param {string} step
 * @param {Paint} paint
 */
export function commandOf(step, paint) {
  const [, command = step, explanation = ""] = /^(\S.*?)(\s{2,}.*)?$/.exec(step) ?? [];
  return `${paint("cyan", command)}${explanation}`;
}
