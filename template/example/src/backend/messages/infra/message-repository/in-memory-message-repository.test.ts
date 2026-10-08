import { describe, expect, test } from "@ingeniozit/caits/testing/backend/infra";
import { describeMessageRepositoryContract } from "#context/domain/port/message-repository/MessageRepository.contract.js";
import { InMemoryMessageRepository } from "./in-memory-message-repository.js";

describeMessageRepositoryContract("InMemory", async () => new InMemoryMessageRepository());

describe("InMemoryMessageRepository", () => {
  test("gives the ids message-1, message-2…: the tests can tell them in advance", async () => {
    const repository = new InMemoryMessageRepository();
    expect([await repository.nextId(), await repository.nextId()]).toEqual(["message-1", "message-2"]);
  });
});
