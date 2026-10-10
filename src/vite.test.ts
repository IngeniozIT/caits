import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, promises, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Plugin, ResolvedConfig, ViteDevServer } from "vite";
import { afterEach, describe, expect, test } from "vitest";
import { kernel, wholeRouteTypes } from "./vite.js";

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

describe("the contexts, while the server runs (dev server, Vitest in watch mode)", () => {
  const ROOT = "/project";
  const DISCOVERED = "/project/node_modules/caits/src/di/discovered.ts";
  const TEST_APPLICATIONS = "/project/node_modules/caits/src/testing/backend/applications.ts";

  /** A server whose environments loaded the modules of the backend: each module, with the files that import it. */
  function serverWithTheContexts() {
    const watcher = new EventEmitter();
    const changed: string[] = [];
    watcher.on("change", (file: string) => changed.push(file));
    const invalidated: string[] = [];
    const loaded: Record<string, string[]> = { "\0virtual:kernel/backend": [DISCOVERED], "\0virtual:kernel/backend-test": [TEST_APPLICATIONS] };
    const moduleGraph = {
      getModuleById: (id: string) => loaded[id] && { id, importers: new Set([...loaded[id].map(file => ({ file })), { file: null }]) },
      invalidateModule: (module: { id: string }) => { invalidated.push(module.id); }
    };
    const server = { watcher, environments: { ssr: { moduleGraph }, client: { moduleGraph: { getModuleById: () => undefined } } } };
    const contexts = kernel().find(plugin => plugin.name === "kernel-contexts") as Plugin;
    (contexts.configResolved as (config: ResolvedConfig) => void)({ root: ROOT } as ResolvedConfig);
    (contexts.configureServer as (server: ViteDevServer) => void)(server as unknown as ViteDevServer);
    return { watcher, changed, invalidated };
  }

  test.for([
    ["a handler comes", "add", "/project/src/backend/notes/application/query/count-notes/count-notes.handler.ts"],
    ["a DTO comes", "add", "/project/src/backend/notes/application/query/count-notes/count-notes.dto.ts"],
    ["a controller goes", "unlink", "/project/src/backend/notes/presentation/count-notes-http/count-notes-http.controller.ts"],
    ["the di.ts of a new context comes", "add", "/project/src/backend/notes/di.ts"],
    ["the context map comes", "add", "/project/src/backend/context-map.ts"]
  ])("when %s, Vite finds the files again, and Vitest runs again the tests that use them", ([, event, file]) => {
    const { watcher, changed, invalidated } = serverWithTheContexts();

    watcher.emit(event, file);

    expect(invalidated).toEqual(["\0virtual:kernel/backend"]);
    expect(changed).toEqual([DISCOVERED]);
  });

  test("a test.di.ts changes the module of the test environments only", () => {
    const { watcher, changed, invalidated } = serverWithTheContexts();

    watcher.emit("add", "/project/src/backend/notes/test.di.ts");

    expect(invalidated).toEqual(["\0virtual:kernel/backend-test"]);
    expect(changed).toEqual([TEST_APPLICATIONS]);
  });

  test("a module that no environment loaded yet finds the files when it loads: nothing to do", () => {
    const { watcher, changed, invalidated } = serverWithTheContexts();

    watcher.emit("add", "/project/src/frontend/notes/presentation/store/NotesStore.ts");

    expect(invalidated).toEqual([]);
    expect(changed).toEqual([]);
  });

  test.for([
    ["a file that no module finds", "/project/src/backend/notes/domain/entity/Note.ts"],
    ["a file out of the source folder", "/project/test/backend/notes/di.ts"],
    ["a file of another project", "/other/src/backend/notes/di.ts"]
  ])("changes nothing when %s comes", ([, file]) => {
    const { watcher, changed, invalidated } = serverWithTheContexts();

    watcher.emit("add", file);

    expect(invalidated).toEqual([]);
    expect(changed).toEqual([]);
  });

  test("changes nothing when a file changes: Vite and Vitest follow the files that they loaded", () => {
    const { watcher, changed, invalidated } = serverWithTheContexts();

    watcher.emit("change", "/project/src/backend/notes/di.ts");

    expect(invalidated).toEqual([]);
    expect(changed).toEqual(["/project/src/backend/notes/di.ts"]);
  });
});
