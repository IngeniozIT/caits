import { describe, expect, test } from "vitest";
import { readScss } from "./scss.mjs";

const STYLESHEET = "src/routes/_frontend/style/app.scss";
/** @type {(text: string, paths?: string[]) => string[]} */
const importsOf = (text, paths = []) => readScss(STYLESHEET, text, new Set(paths)).imports;

describe("the reading of a stylesheet", () => {
  test("gives the files that it loads with @use, @forward and @import, a list of @import included", () => {
    expect(importsOf('@use "sass:math";\n@forward "@fontsource/geist";\n@import "a.css", \'b.css\';\n')).toEqual(["sass:math", "@fontsource/geist", "a.css", "b.css"]);
  });

  test("does not read the comments, and keeps the strings that hold //", () => {
    const text = '// @use "../hidden";\n/* @import "../hidden";\n */\n@use "https://example.com/x" as x; // the end\n';
    expect(importsOf(text)).toEqual(["https://example.com/x"]);
  });

  test("does not take the strings of a configuration, or an @import of a URL, for files", () => {
    expect(importsOf('@use "theme" with ($font: "Geist");\n@import url("https://example.com/x.css");\n')).toEqual(["theme"]);
  });

  test.for([
    ["a partial", "theme", "src/routes/_frontend/style/_theme.scss"],
    ["a stylesheet", "theme", "src/routes/_frontend/style/theme.scss"],
    ["a CSS file", "theme", "src/routes/_frontend/style/theme.css"],
    ["the index of a folder", "parts", "src/routes/_frontend/style/parts/_index.scss"],
    ["a partial in a folder, by its full name", "parts/_menu.scss", "src/routes/_frontend/style/parts/_menu.scss"],
    ["a partial in a folder, by its name with an extension", "parts/menu.scss", "src/routes/_frontend/style/parts/_menu.scss"]
  ])("makes a path of a file next to it relative: %s", ([, specifier, file]) => {
    expect(importsOf(`@use "${specifier}";\n`, [file])).toEqual([`./${specifier}`]);
  });

  test("makes a path of a file of the load path (the style/ folder of the routes) a path from the root of the project", () => {
    const page = "src/routes/_frontend/messages/messages-page.scss";
    expect(readScss(page, '@use "values";\n', new Set(["src/routes/_frontend/style/_values.scss"])).imports).toEqual(["/src/routes/_frontend/style/values"]);
  });

  test("looks next to the stylesheet before the load path, as Sass does", () => {
    const paths = ["src/routes/_frontend/style/_theme.scss", "src/frontend/notes/presentation/view/notes-block/_theme.scss"];
    expect(readScss("src/frontend/notes/presentation/view/notes-block/NotesBlock.scss", '@use "theme";\n', new Set(paths)).imports).toEqual(["./theme"]);
  });

  test("keeps a path that leads to no file of the project: it names a package", () => {
    expect(importsOf('@use "bootstrap/scss/bootstrap";\n', ["src/routes/_frontend/style/_theme.scss"])).toEqual(["bootstrap/scss/bootstrap"]);
  });

  test("keeps the relative paths, the paths from the root and the shortcuts as they are", () => {
    expect(importsOf('@use "./theme";\n@use "../component/logo";\n@use "/theme";\n@use "#frontend/x";\n', ["src/routes/_frontend/style/_theme.scss"]))
      .toEqual(["./theme", "../component/logo", "/theme", "#frontend/x"]);
  });

  test("gives no other fact but its comments: a stylesheet has no code", () => {
    expect(readScss(STYLESHEET, "/* the links */\n.a { color: red; } // red\n", new Set())).toEqual({
      imports: [], imported: [], exports: [], defaultArray: null, classes: [], constructed: [], calls: [], objectTypes: [], strings: [], tags: [],
      comments: [" the links ", " red"]
    });
  });
});
