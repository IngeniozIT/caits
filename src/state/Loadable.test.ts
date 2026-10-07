import { describe, expect, test } from "vitest";
import { settled, type Loadable } from "./Loadable.js";

describe("settled", () => {
  test.for<[Loadable<number>, unknown]>([
    [{ status: "idle" }, undefined],
    [{ status: "loading" }, undefined],
    [{ status: "loaded", data: 3 }, { status: "loaded", data: 3 }],
    [{ status: "failed", message: "HTTP 500" }, { status: "failed", message: "HTTP 500" }]
  ])("%o gives %o", ([loadable, expected]) => {
    expect(settled(loadable)).toEqual(expected);
  });
});
