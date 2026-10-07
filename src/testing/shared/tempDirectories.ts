import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

/** Gives a new empty folder at each call, and removes them all after the tests of the file. */
export function useTempDirectories() {
  const directories: string[] = [];
  afterAll(async () => { await Promise.all(directories.map(directory => rm(directory, { recursive: true, force: true }))); });
  return async (): Promise<string> => {
    const directory = await mkdtemp(join(tmpdir(), "contract-"));
    directories.push(directory);
    return directory;
  };
}
