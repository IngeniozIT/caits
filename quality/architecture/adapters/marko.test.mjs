import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { readMarko } from "./marko.mjs";

const root = mkdtempSync(join(tmpdir(), "caits-marko-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
mkdirSync(join(root, "src/frontend/shared/presentation/component/badge"), { recursive: true });
writeFileSync(join(root, "src/frontend/marko.json"), '{ "tags-dir": "./shared/presentation/component" }\n');
writeFileSync(join(root, "src/frontend/shared/presentation/component/badge/index.marko"), "<strong>Badge</strong>\n");

describe("readMarko", () => {
  test("gives the imports of a template, as it writes them", () => {
    const file = join(root, "src/frontend/notes/presentation/view/notes-block/NotesBlock.marko");

    expect(readMarko(file, 'import Text from "#context/presentation/component/text/Text.marko";\n\n<Text/>\n', root).imports)
      .toEqual(["#context/presentation/component/text/Text.marko"]);
  });

  test("a tag that Marko finds, without an import, counts as an import of its file, from the root of the project", () => {
    const file = join(root, "src/frontend/notes/presentation/view/notes-block/NotesBlock.marko");

    expect(readMarko(file, "<badge/>\n<p>Notes</p>\n", root).imports).toEqual(["/src/frontend/shared/presentation/component/badge/index.marko"]);
  });

  test("a tag of the template itself, or one that Marko does not know, counts as no import", () => {
    const file = join(root, "src/frontend/shared/presentation/component/badge/index.marko");

    expect(readMarko(file, "<badge/>\n<unknown-element/>\n", root).imports).toEqual([]);
  });
});
