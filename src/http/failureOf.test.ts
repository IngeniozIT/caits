import { describe, expect, test } from "vitest";
import { failureOf } from "./failureOf.js";

describe("the failure of a refused HTTP request", () => {
  test("is the detail of its problem", async () => {
    expect(await failureOf(Response.json({ detail: "Une note ne peut pas être vide." }, { status: 422 }))).toEqual(new Error("Une note ne peut pas être vide."));
  });

  test.for([
    ["a body that is not JSON", new Response("oops", { status: 500 })],
    ["a detail that is not text", Response.json({ detail: { code: 1 } }, { status: 400 })],
    ["no detail", Response.json({}, { status: 404 })],
    ["a JSON null", Response.json(null, { status: 503 })]
  ] as const)("is the status when the response has %s", async ([, response]) => {
    expect(await failureOf(response)).toEqual(new Error(`HTTP ${response.status}`));
  });
});
