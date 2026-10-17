import { dirname, posix } from "node:path";
import { linesIn } from "../facts.mjs";

/** A string, or a comment: the comments are removed, the strings stay (a string can hold "//", as a URL does). */
const STRING_OR_COMMENT = /("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
const USE_OR_FORWARD = /@(?:use|forward)\s+(["'])(.+?)\1/g;
const IMPORT = /@import\s+([^;]+);/g;
const QUOTED = /^\s*(["'])(.+)\1\s*$/;

/** The load path that the Vite configuration of CAITS gives to Sass: the folder of the stylesheets of the app (quality/caits/vite.ts). */
export const STYLE_FOLDER = "src/routes/_frontend/style";

/**
 * Reads a stylesheet (SCSS): the files that it loads with `@use`, `@forward` and `@import`, in the order of their lines, and its comments.
 * The comments load nothing.
 * Sass looks for a path first next to the file, then in its load path, then in the packages. Thus a path that leads to a file next to
 * the stylesheet (`theme` for _theme.scss) becomes relative (`./theme`); a path that leads to a file of the load path becomes a path
 * from the root of the project (`/src/routes/_frontend/style/values`); the others stay names of packages, as `sass:math` does.
 * @param {string} path the path of the stylesheet, from the root of the project
 * @param {string} text
 * @param {Set<string>} paths the paths of all the files of the project
 */
export function readScss(path, text, paths) {
  const lineAt = linesIn(text);
  /** @type {string[]} */
  const comments = [];
  /** @type {number[]} */
  const commentLines = [];
  // A comment becomes the line breaks that it holds: the code keeps the lines of the text.
  const code = text.replace(STRING_OR_COMMENT, (/** @type {string} */ match, /** @type {string | undefined} */ string, /** @type {number} */ offset) => {
    if (string !== undefined) return string;
    comments.push(match.startsWith("//") ? match.slice(2) : match.slice(2, -2));
    commentLines.push(lineAt(offset));
    return match.replace(/[^\n]/g, "");
  });
  const codeLineAt = linesIn(code);
  /** @type {{ specifier: string; line: number }[]} */
  const found = [...code.matchAll(USE_OR_FORWARD)].map(match => ({ specifier: match[2], line: codeLineAt(match.index ?? 0) }));
  for (const match of code.matchAll(IMPORT)) {
    let offset = (match.index ?? 0) + match[0].indexOf(match[1]);
    for (const item of match[1].split(",")) {
      const [, , specifier] = QUOTED.exec(item) ?? [];
      if (specifier) found.push({ specifier, line: codeLineAt(offset + item.indexOf(specifier)) });
      offset += item.length + 1;
    }
  }
  found.sort((first, second) => first.line - second.line);
  const imports = found.map(({ specifier }) => {
    if (isIn(dirname(path), specifier, paths)) return `./${specifier}`;
    return isIn(STYLE_FOLDER, specifier, paths) ? `/${posix.join(STYLE_FOLDER, specifier)}` : specifier;
  });
  return {
    imports, imported: [], exports: [], defaultArray: null, classes: [], constructed: [], calls: [], objectTypes: [], strings: [], tags: [], comments,
    lines: { imports: found.map(({ line }) => line), constructed: [], objectTypes: [], tags: [], comments: commentLines }
  };
}

/**
 * Whether Sass finds a path without a dot (`theme`, `parts/menu`) in a folder: `theme.scss`, the partial `_theme.scss`, `theme.css`, or
 * the index of a folder `theme/`.
 * @param {string} folder
 * @param {string} specifier
 * @param {Set<string>} paths
 */
function isIn(folder, specifier, paths) {
  if (/^[./#]|^[a-z]+:/.test(specifier)) return false;
  const base = posix.join(folder, specifier);
  const partial = posix.join(posix.dirname(base), `_${posix.basename(base)}`);
  const candidates = /\.(scss|sass|css)$/.test(base)
    ? [base, partial]
    : [`${base}.scss`, `${partial}.scss`, `${base}.css`, `${base}/_index.scss`, `${base}/index.scss`];
  return candidates.some(candidate => paths.has(candidate));
}
