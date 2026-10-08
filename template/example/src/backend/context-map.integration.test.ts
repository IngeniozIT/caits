import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, productionBackend, test, vi } from "@ingeniozit/caits/testing/backend/integration";
import { AddMessageCommand } from "./messages/application/command/add-message/add-message.dto.js";
import { EditMessageCommand } from "./messages/application/command/edit-message/edit-message.dto.js";
import { RemoveMessageCommand } from "./messages/application/command/remove-message/remove-message.dto.js";
import { ListMessagesQuery } from "./messages/application/query/list-messages/list-messages.dto.js";

/**
 * The backend as it runs in production: with the bindings of each di.ts, and no test.di.ts. The backend has one context, thus no
 * context map yet: when a second context reacts to the events of the first, the map goes in src/backend/context-map.ts.
 */
describe("the backend, on the production bindings", () => {
  let directory: string | undefined;
  afterEach(async () => {
    vi.unstubAllEnvs();
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  const keptIn = async (folder: string) => JSON.parse(await readFile(join(folder, "messages.json"), "utf8")) as unknown;

  test("keeps the messages in the file messages.json of the folder DATA_DIR, and a new backend finds them there", async () => {
    directory = await mkdtemp(join(tmpdir(), "messages-"));
    vi.stubEnv("DATA_DIR", join(directory, "data"));
    const first = productionBackend();
    const { id } = await first.send(new AddMessageCommand("Hello"));
    await first.send(new AddMessageCommand("Bye"));
    await first.send(new EditMessageCommand(id, "Hello again"));

    expect(await keptIn(join(directory, "data"))).toEqual([{ id, text: "Hello again" }, { id: expect.any(String) as string, text: "Bye" }]);

    const second = productionBackend();
    await second.send(new RemoveMessageCommand(id));
    expect((await second.send(new ListMessagesQuery())).messages.map(message => message.text)).toEqual(["Bye"]);
  });

  test("without DATA_DIR, the data folder is tmp, in the working folder", async () => {
    directory = await mkdtemp(join(tmpdir(), "messages-"));
    vi.stubEnv("DATA_DIR", undefined);
    const workingDirectory = process.cwd();
    process.chdir(directory);
    try {
      await productionBackend().send(new AddMessageCommand("Hello"));
    } finally {
      process.chdir(workingDirectory);
    }

    expect(await keptIn(join(directory, "tmp"))).toEqual([{ id: expect.any(String) as string, text: "Hello" }]);
  });
});
