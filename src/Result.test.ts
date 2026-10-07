import { describe, expect, test } from "vitest";
import { err, ok } from "./Result.js";

describe("Result", () => {
  test("ok carries a value and err carries an error", () => {
    expect(ok(3)).toEqual({ ok: true, value: 3 });
    expect(err("nope")).toEqual({ ok: false, error: "nope" });
  });
});
