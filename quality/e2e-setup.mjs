import { rmSync } from "node:fs";

/** The global setup of the end-to-end tests: each run starts with no data. The server keeps its data in webServer.env.DATA_DIR. */
export default function globalSetup(config) {
  const directory = config.webServer?.env?.DATA_DIR;
  if (directory) rmSync(directory, { recursive: true, force: true });
}
