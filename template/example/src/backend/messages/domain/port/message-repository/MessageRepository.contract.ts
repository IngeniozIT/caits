import { describe, expect, test } from "@ingeniozit/caits/testing/backend/infra";
import { Message } from "#context/domain/entity/Message.js";
import type { MessageRepository } from "./MessageRepository.js";

const contentOf = async (repository: MessageRepository) => (await repository.list()).map(({ id, text }) => [id, text]);

/** What every adapter of MessageRepository does. The test of each adapter runs it. */
export function describeMessageRepositoryContract(name: string, create: () => Promise<MessageRepository>) {
  describe(`MessageRepository contract: ${name}`, () => {
    test("starts with no message", async () => {
      expect(await (await create()).list()).toEqual([]);
    });

    test("gives a new id each time", async () => {
      const repository = await create();
      const first = await repository.nextId();
      expect(first).not.toBe("");
      expect(await repository.nextId()).not.toBe(first);
    });

    test("lists the messages in the order they were added, as messages", async () => {
      const repository = await create();
      await repository.save(Message.create("1", "first"));
      await repository.save(Message.create("2", "second"));
      expect(await contentOf(repository)).toEqual([["1", "first"], ["2", "second"]]);
      expect((await repository.list())[0]).toBeInstanceOf(Message);
    });

    test("finds a message by its id", async () => {
      const repository = await create();
      await repository.save(Message.create("1", "first"));
      await repository.save(Message.create("2", "second"));
      expect(await repository.find("2")).toStrictEqual(Message.create("2", "second"));
      expect(await repository.find("3")).toBeUndefined();
    });

    test("saving a message with the id of another replaces it, at its place", async () => {
      const repository = await create();
      await repository.save(Message.create("1", "first"));
      await repository.save(Message.create("2", "second"));
      await repository.save(Message.create("1", "first, edited"));
      expect(await contentOf(repository)).toEqual([["1", "first, edited"], ["2", "second"]]);
    });

    test("removes the message that has the id, and only it", async () => {
      const repository = await create();
      await repository.save(Message.create("1", "first"));
      await repository.save(Message.create("2", "second"));
      await repository.remove("1");
      expect(await contentOf(repository)).toEqual([["2", "second"]]);
    });
  });
}
