import compiler from "@marko/compiler";
import { dirname, relative } from "node:path";
import { factsOf } from "../facts.mjs";

/**
 * Reads a Marko template (its absolute path, and its text) with the Marko compiler: it parses the markup and the JavaScript in it,
 * and translates nothing.
 * A tag that Marko finds by discovery (in a tags/ folder, or in the folder of tags that a marko.json gives: the components of the
 * frontend context shared) is a dependency without an import: it counts as one, from the root of the project (/src/…). The rules on
 * the direction of the imports read it, at the line of its first tag; the rule on ../ does not, since nobody wrote it.
 * @param {string} file
 * @param {string} text
 * @param {string} root the root of the project
 */
export function readMarko(file, text, root) {
  const { ast } = compiler.compileSync(text, file, { output: "source", ast: true, code: false, sourceMaps: false });
  const facts = factsOf(ast.program, text);
  const lookup = compiler.taglib.buildLookup(dirname(file));
  for (const name of new Set(facts.tags)) {
    const template = lookup.getTag(name)?.template;
    if (!template || template === file || template.includes("/node_modules/")) continue;
    facts.imports.push(`/${relative(root, template).replaceAll("\\", "/")}`);
    facts.lines.imports.push(facts.lines.tags[facts.tags.indexOf(name)]);
  }
  return facts;
}
