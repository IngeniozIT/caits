import { describe, expect, test } from "vitest";
import { SSE_HEADERS, sseComment, sseEvent } from "./sse.js";

describe("server-sent events", () => {
  test("an event is its data, line by line, and ends with an empty line", () => {
    expect(sseEvent('{"a":1}')).toBe('data: {"a":1}\n\n');
    expect(sseEvent("one\ntwo")).toBe("data: one\ndata: two\n\n");
  });

  test("an event may have a name and an id, before its data", () => {
    expect(sseEvent("x", { event: "model", id: "7" })).toBe("event: model\nid: 7\ndata: x\n\n");
    expect(sseEvent("x", { id: "7" })).toBe("id: 7\ndata: x\n\n");
  });

  test("a line of the data ends at \\r\\n, \\r or \\n, as a client reads it: each line gets its field", () => {
    expect(sseEvent("one\r\ntwo\rthree\nfour")).toBe("data: one\ndata: two\ndata: three\ndata: four\n\n");
    expect(sseComment("one\r\ntwo\rthree")).toBe(": one\n: two\n: three\n\n");
  });

  test("a name or an id on more than one line is refused: its next line would be a field of its own", () => {
    expect(() => sseEvent("x", { event: "model\nretry: 1" })).toThrow('The event of a server-sent event holds no line break: "model\\nretry: 1"');
    expect(() => sseEvent("x", { id: "7\rdata: injected" })).toThrow('The id of a server-sent event holds no line break: "7\\rdata: injected"');
  });

  test("a comment starts each line with a colon, which the clients ignore", () => {
    expect(sseComment("queued position=2")).toBe(": queued position=2\n\n");
    expect(sseComment("one\ntwo")).toBe(": one\n: two\n\n");
  });

  test("the headers say a stream of events, which no cache keeps and no proxy compresses", () => {
    expect(SSE_HEADERS).toEqual({ "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform" });
  });
});
