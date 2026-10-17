import { describe, expect, test } from "vitest";
import { readTypeScript } from "./typescript.mjs";

/** A file whose constructs are each on a line of its own, after a line of letters that UTF-8 writes on several bytes. */
const TEXT = `// É, ñ, 😀: the lines count characters, not bytes
import { Port } from "#context/domain/port/clock/Clock.js";
export const LIMIT = 3;
/* eslint-disable */
export class Adapter implements Port {
  readonly type = "notes.loaded" as const;
  run() { return new Date(); }
}
export default [
  bind(Port).to(Adapter),
  { type: "notes.asked" }
];
test.skip(() => import("./lazy.js"));
`;

describe("readTypeScript", () => {
  test("gives the line of each construct that a rule points at", () => {
    const facts = readTypeScript("src/backend/notes/infra/clock/adapter.ts", TEXT);

    expect(facts.imports.map((specifier, index) => [specifier, facts.lines.imports[index]])).toEqual([["#context/domain/port/clock/Clock.js", 2], ["./lazy.js", 13]]);
    expect(facts.imported).toEqual([{ name: "Port", from: "#context/domain/port/clock/Clock.js", line: 2 }]);
    expect(facts.exports.map(({ name, line }) => [name, line])).toEqual([["LIMIT", 3], ["Adapter", 5], ["default", 9]]);
    expect(facts.comments.map((comment, index) => [comment.trim(), facts.lines.comments[index]])).toEqual([["É, ñ, 😀: the lines count characters, not bytes", 1], ["eslint-disable", 4]]);
    expect(facts.classes.map(({ name, line, properties }) => [name, line, properties.map(property => [property.name, property.line])])).toEqual([["Adapter", 5, [["type", 6]]]]);
    expect(facts.constructed.map((name, index) => [name, facts.lines.constructed[index]])).toEqual([["Date", 7]]);
    expect(facts.defaultArray?.map(({ source, line }) => [source, line])).toEqual([["bind(Port).to(Adapter)", 10], ['{ type: "notes.asked" }', 11]]);
    expect(facts.objectTypes.map((type, index) => [type, facts.lines.objectTypes[index]])).toEqual([["notes.asked", 11]]);
    expect(facts.calls.filter(({ name }) => name === "skip").map(({ root, line }) => [root, line])).toEqual([["test", 13]]);
  });
});
