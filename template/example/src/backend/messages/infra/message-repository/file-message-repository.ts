import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DataDirectory } from "@ingeniozit/caits/di/DataDirectory";
import { Message } from "#context/domain/entity/Message.js";
import type { MessageRepository } from "#context/domain/port/message-repository/MessageRepository.js";

/** A message, as the file keeps it. */
type Row = { id: string; text: string };

/** Keeps the messages in a JSON file of the data folder. */
export class FileMessageRepository implements MessageRepository {
  private readonly path: string;

  constructor(directory: DataDirectory, fileName: string) {
    this.path = join(directory, fileName);
  }

  nextId(): Promise<string> {
    return Promise.resolve(randomUUID());
  }

  async list(): Promise<Message[]> {
    return (await this.read()).map(row => Message.restore(row.id, row.text));
  }

  async find(id: string): Promise<Message | undefined> {
    return (await this.list()).find(message => message.id === id);
  }

  async save(message: Message): Promise<void> {
    const rows = await this.read();
    const row = { id: message.id, text: message.text };
    const index = rows.findIndex(candidate => candidate.id === message.id);
    if (index === -1) rows.push(row);
    else rows[index] = row;
    await this.write(rows);
  }

  async remove(id: string): Promise<void> {
    await this.write((await this.read()).filter(row => row.id !== id));
  }

  private async read(): Promise<Row[]> {
    try {
      return JSON.parse(await readFile(this.path, "utf8")) as Row[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  /** Writes the whole file, then renames it: a reader never sees half a file. */
  private async write(rows: Row[]): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.tmp`;
    await writeFile(temporary, JSON.stringify(rows, null, 2));
    await rename(temporary, this.path);
  }
}
