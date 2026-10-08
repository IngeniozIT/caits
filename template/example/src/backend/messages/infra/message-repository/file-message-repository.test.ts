import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test, useTempDirectories } from "@ingeniozit/caits/testing/backend/infra";
import { describeMessageRepositoryContract } from "#context/domain/port/message-repository/MessageRepository.contract.js";
import { FileMessageRepository } from "./file-message-repository.js";

const freshDirectory = useTempDirectories();

describeMessageRepositoryContract("File", async () => new FileMessageRepository(join(await freshDirectory(), "not-made-yet"), "messages.json"));

describe("FileMessageRepository on a damaged file", () => {
  test("reports the damage instead of pretending there is no message", async () => {
    const directory = await freshDirectory();
    await writeFile(join(directory, "damaged.json"), "{not json");
    await expect(new FileMessageRepository(directory, "damaged.json").list()).rejects.toThrow();
  });
});
