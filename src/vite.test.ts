import { mkdirSync, mkdtempSync, promises, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { wholeRouteTypes } from "./vite.js";

/** @marko/run writes the file as fs.promises.writeFile, which it reads at each call. */
const writeFile = (file: string, text: string) => promises.writeFile(file, text);

const folders: string[] = [];
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });

function newFolder(): string {
  const folder = mkdtempSync(join(tmpdir(), "caits-route-types-"));
  folders.push(folder);
  mkdirSync(join(folder, ".marko-run"));
  return folder;
}

describe("wholeRouteTypes", () => {
  test("writes the types of the routes in a file of their own, which then takes the name of the file: the file is never empty", async () => {
    wholeRouteTypes();
    const types = join(newFolder(), ".marko-run/routes.d.ts");
    writeFileSync(types, "the types before");
    const before = statSync(types).ino;

    await writeFile(types, "the types after");

    expect(readFileSync(types, "utf8")).toBe("the types after");
    expect(statSync(types).ino).not.toBe(before);
    expect(readdirSync(join(types, ".."))).toEqual(["routes.d.ts"]);
  });

  test("writes the other files as node:fs does, in place", async () => {
    wholeRouteTypes();
    const other = join(newFolder(), ".marko-run/other.d.ts");
    writeFileSync(other, "before");
    const before = statSync(other).ino;

    await writeFile(other, "after");

    expect(readFileSync(other, "utf8")).toBe("after");
    expect(statSync(other).ino).toBe(before);
  });

  test("is a plugin of Vite, which the configuration of a project lists", () => {
    expect(wholeRouteTypes()).toEqual({ name: "caits-whole-route-types" });
  });
});
