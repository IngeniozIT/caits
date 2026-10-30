/** The headers of a stream of server-sent events: no cache, and no compression that would hold its chunks back. */
export const SSE_HEADERS: Readonly<Record<string, string>> = { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform" };

/** Where a client of server-sent events ends a line. */
const LINE_BREAK = /\r\n|\r|\n/;

/** The value of a field that has one line: a line break would end the field, and start another one. */
function oneLine(field: "event" | "id", value: string): string {
  if (/[\r\n]/.test(value)) throw new Error(`The ${field} of a server-sent event holds no line break: ${JSON.stringify(value)}`);
  return value;
}

/** A server-sent event: its name and its id when it has them, then its data, line by line. */
export function sseEvent(data: string, { event, id }: { readonly event?: string; readonly id?: string } = {}): string {
  const name = event === undefined ? "" : `event: ${oneLine("event", event)}\n`;
  const identity = id === undefined ? "" : `id: ${oneLine("id", id)}\n`;
  return `${name}${identity}${data.split(LINE_BREAK).map(line => `data: ${line}`).join("\n")}\n\n`;
}

/** A comment, which a client of server-sent events ignores: it keeps the connection alive, and can tell a person what happens. */
export function sseComment(text: string): string {
  return `${text.split(LINE_BREAK).map(line => `: ${line}`).join("\n")}\n\n`;
}
