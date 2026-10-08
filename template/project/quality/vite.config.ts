import { mergeConfig } from "vitest/config";
import caits from "./caits/vite.ts";

/** The configuration of Vite (build, dev server) and Vitest of this project: that of CAITS (quality/caits/vite.ts), with the changes of this project. */
export default mergeConfig(caits, {});
