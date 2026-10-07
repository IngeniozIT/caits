import { Token } from "../Token.js";

/** The folder where the adapters that write files keep their data. */
export type DataDirectory = string;

export const DataDirectory = new Token<DataDirectory>();
