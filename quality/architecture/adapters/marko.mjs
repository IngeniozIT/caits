import compiler from "@marko/compiler";
import { dirname, relative } from "node:path";
import { factsOf } from "../facts.mjs";

/**
 * Reads a Marko template (its absolute path, and its text) with the Marko compiler: it parses the markup and the JavaScript in it,
 * and translates nothing.
 * A tag that Marko finds by discovery (in a tags/ folder of the project) is a dependency without an import: it counts as one.
 */
export function readMarko(file, text) {
  const { ast } = compiler.compileSync(text, file, { output: "source", ast: true, code: false, sourceMaps: false });
  const facts = factsOf(ast.program, text);
  const lookup = compiler.taglib.buildLookup(dirname(file));
  for (const name of new Set(facts.tags)) {
    const template = lookup.getTag(name)?.template;
    if (!template || template === file || template.includes("/node_modules/")) continue;
    const specifier = relative(dirname(file), template).replaceAll("\\", "/");
    facts.imports.push(specifier.startsWith(".") ? specifier : `./${specifier}`);
  }
  return facts;
}
