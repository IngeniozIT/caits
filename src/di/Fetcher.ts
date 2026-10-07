import { Token } from "../Token.js";

/** How a frontend reaches the API: on the server, the fetch of the request; in the browser, the fetch of the browser. */
export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export const Fetcher = new Token<Fetcher>();
