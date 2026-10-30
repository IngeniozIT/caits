import { describe, expect, test } from "vitest";
import { BodyTooLargeError, CrossSiteRequestError, InvalidInputError, MalformedBodyError, MAX_BODY_SIZE, Request, UnsupportedMediaTypeError } from "./Request.js";

/** A request of CAITS around a request of the web, which POSTs a body. */
const post = (body: BodyInit | null, headers: Record<string, string> = {}) => new Request(new globalThis.Request("http://localhost/", { method: "POST", body, headers }));
const json = (body: BodyInit | null, contentType = "application/json") => post(body, { "content-type": contentType });
/** A request whose body has the given type, or none: the request of the web gives a text the type text/plain, unless it is removed. */
const typed = (body: string, contentType: string | undefined) => {
  const request = new globalThis.Request("http://localhost/", { method: "POST", body, headers: contentType === undefined ? {} : { "content-type": contentType } });
  if (contentType === undefined) request.headers.delete("content-type");
  return new Request(request);
};

describe("Request", () => {
  test("gives the address, the method, the headers and the signal of the request of the web", () => {
    const client = new AbortController();
    const request = new Request(new globalThis.Request("http://localhost/notes?page=2", { method: "PUT", headers: { "x-client": "dofupaw" }, signal: client.signal }));
    expect([request.url, request.method, request.headers.get("x-client")]).toEqual(["http://localhost/notes?page=2", "PUT", "dofupaw"]);
    expect(request.signal.aborted).toBe(false);
    client.abort();
    expect(request.signal.aborted).toBe(true);
  });

  describe("the content of a body of JSON", () => {
    test("is the value of the JSON", async () => {
      expect(await json(JSON.stringify({ text: "à relire" })).content()).toEqual({ text: "à relire" });
      expect(await json("null").content()).toBeNull();
    });

    test("is read once, and given again at each call: the request of the web reads its body once only", async () => {
      const request = json(JSON.stringify({ a: 1 }));
      expect(await request.content()).toEqual({ a: 1 });
      expect(await request.content()).toEqual({ a: 1 });
    });

    test.for([
      "application/json",
      "application/json; charset=utf-8",
      "application/json ; charset=utf-8",
      "Application/JSON;charset=UTF-8",
      "application/merge-patch+json",
      "application/vnd.api+json; ext=bulk",
      "text/x.custom+json"
    ])("is read when the content type is JSON: %s", async contentType => {
      expect(await json('{"a":1}', contentType).content()).toEqual({ a: 1 });
    });

    test("is refused when the body is larger than 1 MB, whose rest is not read", async () => {
      expect(MAX_BODY_SIZE).toBe(1024 * 1024);
      let given = 0;
      const chunk = new Uint8Array(64 * 1024).fill(32);
      const body = new ReadableStream<Uint8Array>({ pull(controller) { given += chunk.byteLength; controller.enqueue(chunk); } });
      const request = new Request(new globalThis.Request("http://localhost/", { method: "POST", body, headers: { "content-type": "application/json" }, duplex: "half" } as RequestInit));

      const attempt = request.content();

      await expect(attempt).rejects.toBeInstanceOf(BodyTooLargeError);
      await expect(attempt).rejects.toBeInstanceOf(InvalidInputError);
      await expect(attempt).rejects.toThrow("The body is larger than 1048576 bytes");
      expect(given).toBeLessThan(2 * MAX_BODY_SIZE);
    });

    test("is read up to 1 MB exactly, or up to the size that the controller gives, which the first call sets", async () => {
      const ofSize = (size: number) => json(`"${"a".repeat(size - 2)}"`);
      expect(await ofSize(MAX_BODY_SIZE).content()).toHaveLength(MAX_BODY_SIZE - 2);
      expect(await ofSize(10).content({ maxSize: 10 })).toBe("aaaaaaaa");
      const tooLarge = ofSize(11);
      await expect(tooLarge.content({ maxSize: 10 })).rejects.toThrow("The body is larger than 10 bytes");
      await expect(tooLarge.content({ maxSize: 20 })).rejects.toThrow("The body is larger than 10 bytes");
    });

    test("is read when the bytes of a character come in two chunks, and refused when the body stops inside a character", async () => {
      const streamOf = (...chunks: number[][]) => new Request(new globalThis.Request("http://localhost/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: new ReadableStream<Uint8Array>({ start(controller) { for (const chunk of chunks) controller.enqueue(new Uint8Array(chunk)); controller.close(); } }),
        duplex: "half"
      } as RequestInit));
      const [quote, firstByteOfE, secondByteOfE] = [0x22, 0xc3, 0xa9];

      expect(await streamOf([quote, firstByteOfE], [secondByteOfE, quote]).content()).toBe("é");
      await expect(streamOf([0x31, firstByteOfE]).content()).rejects.toThrow("Invalid JSON");
    });

    test("is refused when the body is not JSON, or is empty, with an error that says so", async () => {
      const attempt = json("{not json").content();
      await expect(attempt).rejects.toBeInstanceOf(MalformedBodyError);
      await expect(attempt).rejects.toBeInstanceOf(InvalidInputError);
      await expect(attempt).rejects.toThrow("Invalid JSON");
      await expect(json(null).content()).rejects.toThrow("Invalid JSON");
    });
  });

  describe("the content of a form", () => {
    test("is an object of its fields, a text or a File for each name, a list for a name that comes more than once", async () => {
      const sent = new FormData();
      sent.append("model", "whisper");
      sent.append("audio", new File([new Uint8Array([0, 255, 1])], "voice.wav", { type: "audio/wav" }));
      sent.append("tag", "a");
      sent.append("tag", "b");
      sent.append("tag", "c");
      const { model, audio, tag } = await post(sent).content() as { model: string; audio: File; tag: string[] };
      expect([model, tag]).toEqual(["whisper", ["a", "b", "c"]]);
      expect([audio.name, audio.type, [...new Uint8Array(await audio.arrayBuffer())]]).toEqual(["voice.wav", "audio/wav", [0, 255, 1]]);
    });

    test("holds each name as a field of its own, as JSON.parse makes it, also __proto__", async () => {
      const fields = await post(new URLSearchParams([["__proto__", "a"], ["toString", "b"], ["__proto__", "c"]])).content() as object;
      expect(Object.entries(fields)).toEqual([["__proto__", ["a", "c"]], ["toString", "b"]]);
      expect(Object.getPrototypeOf(fields)).toBe(Object.prototype);
      expect(Object.getOwnPropertyDescriptors(fields)).toStrictEqual(Object.getOwnPropertyDescriptors(JSON.parse('{ "__proto__": ["a", "c"], "toString": "b" }')));
    });

    test("is read once, and given again at each call", async () => {
      const request = post(new URLSearchParams({ language: "fr" }));
      expect(await request.content()).toEqual({ language: "fr" });
      expect(await request.content()).toEqual({ language: "fr" });
    });

    test.for([
      "multipart/form-data; boundary=x",
      "Multipart/Form-Data;boundary=x",
      "application/x-www-form-urlencoded",
      "application/x-www-form-urlencoded ; charset=UTF-8"
    ])("is read when the content type is a form: %s", async contentType => {
      const body = contentType.startsWith("application") ? "language=fr" : '--x\r\nContent-Disposition: form-data; name="language"\r\n\r\nfr\r\n--x--\r\n';
      expect(await post(body, { "content-type": contentType }).content()).toEqual({ language: "fr" });
    });

    test.for(["cross-site", "same-site"])("is refused when a browser sends it from another site, which it says with Sec-Fetch-Site: %s", async site => {
      const attempt = post(new URLSearchParams({ language: "fr" }), { "sec-fetch-site": site }).content();
      await expect(attempt).rejects.toBeInstanceOf(CrossSiteRequestError);
      await expect(attempt).rejects.toBeInstanceOf(InvalidInputError);
      await expect(attempt).rejects.toThrow("A browser sent this form from another site");
    });

    test.for(["same-origin", "none"])("is read when a browser sends it from the app itself, or a person asks it: Sec-Fetch-Site: %s", async site => {
      expect(await post(new URLSearchParams({ language: "fr" }), { "sec-fetch-site": site }).content()).toEqual({ language: "fr" });
    });

    test("is read up to 1 MB by default, or up to the size that the controller gives, and refused beyond", async () => {
      const ofSize = (size: number) => post(`a=${"b".repeat(size - 2)}`, { "content-type": "application/x-www-form-urlencoded" });
      expect(((await ofSize(MAX_BODY_SIZE).content()) as { a: string }).a).toHaveLength(MAX_BODY_SIZE - 2);
      await expect(ofSize(MAX_BODY_SIZE + 1).content()).rejects.toThrow("The body is larger than 1048576 bytes");
      expect(await ofSize(10).content({ maxSize: 10 })).toEqual({ a: "bbbbbbbb" });
      const attempt = ofSize(11).content({ maxSize: 10 });
      await expect(attempt).rejects.toBeInstanceOf(BodyTooLargeError);
      await expect(attempt).rejects.toThrow("The body is larger than 10 bytes");
    });

    test("is refused when the body is not the form that it says, with an error that says so", async () => {
      const attempt = post("not a form", { "content-type": "multipart/form-data; boundary=x" }).content();
      await expect(attempt).rejects.toBeInstanceOf(MalformedBodyError);
      await expect(attempt).rejects.toThrow("Invalid form");
    });
  });

  test.for([
    ["no content type", undefined],
    ["text/plain, which a form of another site sends without asking the server first", "text/plain;charset=UTF-8"],
    ["text/plain and a parameter that names JSON", "text/plain; a=application/json"],
    ["text/plain and a parameter that ends with +json", "text/plain;x+json"],
    ["text/plain and a parameter that names a form", "text/plain; a=multipart/form-data"],
    ["a type that starts with the word json", "application/jsonx"],
    ["a type that starts with the type of a form", "multipart/form-datax"],
    ["a type with json before its end", "application/json+xml"],
    ["a type without a subtype", "+json"],
    ["a space in the type", "my app/x+json"],
    ["a space in the subtype", "application/x y+json"],
    ["two slashes", "application/x/y+json"]
  ])("refuses a body with %s: the request must say that it sends JSON or a form", async ([, contentType]) => {
    const attempt = typed('{"a":1}', contentType).content();
    await expect(attempt).rejects.toBeInstanceOf(UnsupportedMediaTypeError);
    await expect(attempt).rejects.toBeInstanceOf(InvalidInputError);
    await expect(attempt).rejects.toThrow(new UnsupportedMediaTypeError("The content type must be application/json, multipart/form-data or application/x-www-form-urlencoded"));
  });

  test("a refused request is a named error that carries what was wrong", () => {
    const error = new InvalidInputError("not a number", { input: "abc" });
    expect(error).toMatchObject({ name: "InvalidInputError", message: "not a number", details: { input: "abc" } });
    expect(error).toBeInstanceOf(Error);
  });
});
