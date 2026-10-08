export class MessageNotFoundError extends Error {
  constructor(id: string) {
    super(`There is no message with the id ${id}.`);
    this.name = "MessageNotFoundError";
  }
}
