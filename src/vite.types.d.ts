import type { Plugin } from "vite";

/** The types of vite.js, for the projects: TypeScript reads no types from the JavaScript of a package. Keep them the same as vite.js. */

export type KernelOptions = {
  /** The folder that holds backend/ and frontend/, from the root of the project. */
  source?: string;
};

/** The plugins of the kernel, for Vite and Vitest: the dependencies of the classes, and the contexts of the project. */
export declare function kernel(options?: KernelOptions): Plugin[];
