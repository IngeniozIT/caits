import { dirname, posix } from "node:path";

/** A string, or a comment: the comments are removed, the strings stay (a string can hold "//", as a URL does). */
const STRING_OR_COMMENT = /("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
const USE_OR_FORWARD = /@(?:use|forward)\s+(["'])(.+?)\1/g;
const IMPORT = /@import\s+([^;]+);/g;
const QUOTED = /^\s*(["'])(.+)\1\s*$/;

/** The load path that the Vite configuration of CAITS gives to Sass: the folder of the stylesheets of the app (quality/caits/vite.ts). */
export const STYLE_FOLDER = "src/routes/_frontend/style";

/**
 * Reads a stylesheet (SCSS): the files that it loads with `@use`, `@forward` and `@import`. The comments do not count.
 * Sass looks for a path first next to the file, then in its load path, then in the packages. Thus a path that leads to a file next to
 * the stylesheet (`theme` for _theme.scss) becomes relative (`./theme`); a path that leads to a file of the load path becomes a path
 * from the root of the project (`/src/routes/_frontend/style/values`); the others stay names of packages, as `sass:math` does.
 * @param {string} path the path of the stylesheet, from the root of the project
 * @param {string} text
 * @param {Set<string>} paths the paths of all the files of the project
 */
export function readScss(path, text, paths) {
  const code = text.replace(STRING_OR_COMMENT, (/** @type {string} */ _match, /** @type {string | undefined} */ string) => string ?? "");
  const specifiers = [...code.matchAll(USE_OR_FORWARD)].map(match => match[2]);
  for (const [, list] of code.matchAll(IMPORT)) {
    for (const item of list.split(",")) {
      const [, , specifier] = QUOTED.exec(item) ?? [];
      if (specifier) specifiers.push(specifier);
    }
  }
  const imports = specifiers.map(specifier => {
    if (isIn(dirname(path), specifier, paths)) return `./${specifier}`;
    return isIn(STYLE_FOLDER, specifier, paths) ? `/${posix.join(STYLE_FOLDER, specifier)}` : specifier;
  });
  return { imports, exports: [], defaultArray: null, classes: [], constructed: [], calls: [], objectTypes: [], strings: [], tags: [] };
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
