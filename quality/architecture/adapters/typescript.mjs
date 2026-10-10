import { parseSync } from "vite";
import { factsOf } from "../facts.mjs";

/**
 * Reads a TypeScript file with oxc, the parser of Vite, which the build already uses (the plugin of the kernel, caits/vite).
 * @param {string} path
 * @param {string} text
 */
export function readTypeScript(path, text) {
  const { program, errors } = parseSync(path, text);
  if (errors.length > 0) throw new Error(`${path}: ${errors[0].message}`);
  return factsOf(program, text);
}
