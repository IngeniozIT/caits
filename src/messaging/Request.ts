export class InvalidInputError extends Error {
  constructor(message: string, readonly details?: unknown) {
    super(message);
    this.name = "InvalidInputError";
  }
}

export class MalformedBodyError extends InvalidInputError {}

export class UnsupportedMediaTypeError extends InvalidInputError {}

export class BodyTooLargeError extends InvalidInputError {}

export class CrossSiteRequestError extends InvalidInputError {}

/** The largest body that content reads by default, in bytes: 1 MB. */
export const MAX_BODY_SIZE = 1024 * 1024;

/**
 * A JSON media type, in any case: application/json, or a type with the suffix +json (application/merge-patch+json). Parameters can
 * follow, after a ";". A parameter is not the type: a browser sends `text/plain;x+json` from any site, as text/plain.
 */
const JSON_MEDIA_TYPE = /^(?:application\/json|[^\s/]+\/[^\s/;]+\+json)\s*(?:;|$)/i;

/** The media types of a form, in any case, with parameters after a ";": the boundary of the parts of multipart/form-data. */
const FORM_MEDIA_TYPE = /^(?:multipart\/form-data|application\/x-www-form-urlencoded)\s*(?:;|$)/i;

/** The headers of a request, which a controller reads and does not change. */
export type RequestHeaders = Pick<Headers, "get" | "has" | "forEach" | "entries" | "keys" | "values" | typeof Symbol.iterator>;

/** What content reads: the largest body, in bytes. */
export type ContentOptions = { readonly maxSize?: number };

/**
 * The request that a controller reads. It gives the address, the method, the headers and the signal of a client that leaves, as the
 * request of the web gives them, and the content of the body, which it reads once, and gives again at each call: the request of the web
 * reads its body once only. A controller reads this request, never the request of the web (rule controllers-read-the-request-of-caits).
 */
export class Request {
  readonly url: string;
  readonly method: string;
  readonly headers: RequestHeaders;
  /** Aborts when the client leaves. */
  readonly signal: AbortSignal;
  readonly #request: globalThis.Request;
  /** The bytes of the body, once read: the first call of content reads them, with its largest size. */
  #body: Promise<Blob> | undefined;

  constructor(request: globalThis.Request) {
    this.#request = request;
    this.url = request.url;
    this.method = request.method;
    this.headers = request.headers;
    this.signal = request.signal;
  }

  /**
   * The content of the body: the value of its JSON, or the fields of a form as an object, a text or a File for each name, a list for a
   * name that comes more than once. The request must say what its body is: content-type application/json, or a type with the suffix
   * +json, or a form, multipart/form-data or application/x-www-form-urlencoded. A browser sends a body of another type (text/plain) or a
   * form from any site, without asking the server first, and says where the request comes from in its header Sec-Fetch-Site, which a
   * client that is not a browser does not send: a form that a browser sends from another site is refused. The body must not be larger
   * than `maxSize` bytes (MAX_BODY_SIZE, 1 MB, by default): the rest of a larger body is not read. The first call reads the body, with its
   * `maxSize`; the next calls give its content again.
   * @throws {UnsupportedMediaTypeError} when the request does not say that its body is JSON or a form: the Controller answers 415.
   * @throws {CrossSiteRequestError} when a browser sends the form from another site: the Controller answers 403.
   * @throws {BodyTooLargeError} when the body is larger than `maxSize`: the Controller answers 413.
   * @throws {MalformedBodyError} when the body is not JSON, or not the form that it says: the Controller answers 400.
   */
  async content({ maxSize = MAX_BODY_SIZE }: ContentOptions = {}): Promise<unknown> {
    const contentType = this.headers.get("content-type");
    if (contentType?.match(JSON_MEDIA_TYPE)) {
      const text = await (await this.#bytes(maxSize)).text();
      try {
        return JSON.parse(text);
      } catch {
        throw new MalformedBodyError("Invalid JSON");
      }
    }
    if (!contentType?.match(FORM_MEDIA_TYPE)) throw new UnsupportedMediaTypeError("The content type must be application/json, multipart/form-data or application/x-www-form-urlencoded");
    const site = this.headers.get("sec-fetch-site");
    if (site === "cross-site" || site === "same-site") throw new CrossSiteRequestError("A browser sent this form from another site");
    const bytes = await this.#bytes(maxSize);
    let form: FormData;
    try {
      form = await new Response(bytes, { headers: { "content-type": contentType } }).formData();
    } catch {
      throw new MalformedBodyError("Invalid form");
    }
    const fields: Record<string, FormDataEntryValue | FormDataEntryValue[]> = {};
    for (const [name, value] of form) {
      // A field of its own, as JSON.parse makes it, also for a name such as __proto__.
      const known = Object.hasOwn(fields, name) ? fields[name] : undefined;
      Object.defineProperty(fields, name, { value: known === undefined ? value : [known, value].flat(), enumerable: true, writable: true, configurable: true });
    }
    return fields;
  }

  #bytes(maxSize: number): Promise<Blob> {
    this.#body ??= bytesOf(this.#request, maxSize);
    return this.#body;
  }
}

/** The bytes of the body, read chunk by chunk: the reading stops at the first chunk after `maxSize` bytes. */
async function bytesOf(request: globalThis.Request, maxSize: number): Promise<Blob> {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  const reader = request.body?.getReader();
  for (let chunk = await reader?.read(); chunk && !chunk.done; chunk = await reader?.read()) {
    size += chunk.value.byteLength;
    if (size > maxSize) throw new BodyTooLargeError(`The body is larger than ${maxSize} bytes`);
    chunks.push(chunk.value);
  }
  return new Blob(chunks);
}
