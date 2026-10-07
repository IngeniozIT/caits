import { parseSync } from "vite";
import { describe, expect, test } from "vitest";
import { declareDependencies } from "./declareDependencies.js";

/** The lines that the module needs after its own code. */
const written = (code: string) => declareDependencies(code, "module.ts", parseSync, [])?.split("\n");

describe("declaring the dependencies of the classes of a module", () => {
  test("writes the name of each parameter and the token of its type, imported from a relative path", () => {
    const code = `import type { Clock } from "./Clock.js";
import { Store } from "../Store.js";
export class Handler {
  constructor(private readonly clock: Clock, store: Store) {}
}`;
    expect(written(code)).toEqual([
      'import * as __dependencies_0 from "./Clock.js";',
      'import * as __dependencies_1 from "../Store.js";',
      'Handler[Symbol.for("kernel.dependencies")] = [{ name: "clock", token: () => __dependencies_0["Clock"] }, { name: "store", token: () => __dependencies_1["Store"] }];'
    ]);
  });

  test("writes the token of a type imported from a shortcut of the project (#…): a package.json or a tsconfig.json gives its path", () => {
    const code = `import type { Clock } from "#ports/Clock.js";
import { Store } from "#app/Store.js";
export class Handler {
  constructor(clock: Clock, store: Store) {}
}`;
    expect(written(code)).toEqual([
      'import * as __dependencies_0 from "#ports/Clock.js";',
      'import * as __dependencies_1 from "#app/Store.js";',
      'Handler[Symbol.for("kernel.dependencies")] = [{ name: "clock", token: () => __dependencies_0["Clock"] }, { name: "store", token: () => __dependencies_1["Store"] }];'
    ]);
  });

  test("imports a module once, and reads the name a type has in its module", () => {
    expect(written(`import { type Clock as Time, Store } from "./ports.js";
import Default from "./Default.js";
import { "odd name" as Odd } from "./odd.js";
class Handler { constructor(time: Time, store: Store, value: Default, odd: Odd) {} }`)).toEqual([
      'import * as __dependencies_0 from "./ports.js";',
      'import * as __dependencies_1 from "./Default.js";',
      'import * as __dependencies_2 from "./odd.js";',
      'Handler[Symbol.for("kernel.dependencies")] = [{ name: "time", token: () => __dependencies_0["Clock"] }, { name: "store", token: () => __dependencies_0["Store"] }, ' +
      '{ name: "value", token: () => __dependencies_1["default"] }, { name: "odd", token: () => __dependencies_2["odd name"] }];'
    ]);
  });

  test("writes the token of a type imported from a package it is given, as the kernel gives the tokens it declares", () => {
    const code = `import type { EventPublisher } from "@kernel/messaging/EventPublisher";
import { Fetcher } from "@kernel";
import type { Schema } from "zod";
import type { Other } from "@kernels/other";
class Handler { constructor(events: EventPublisher, fetch: Fetcher, schema: Schema, other: Other) {} }`;
    expect(declareDependencies(code, "module.ts", parseSync, ["@kernel"])?.split("\n")).toEqual([
      'import * as __dependencies_0 from "@kernel/messaging/EventPublisher";',
      'import * as __dependencies_1 from "@kernel";',
      'Handler[Symbol.for("kernel.dependencies")] = [{ name: "events", token: () => __dependencies_0["EventPublisher"] }, { name: "fetch", token: () => __dependencies_1["Fetcher"] }, ' +
      '{ name: "schema" }, { name: "other" }];'
    ]);
  });

  test("a type with a value of the same name in the module is its own token: a port, a class, a function or an enum", () => {
    expect(written(`export interface Port {}
export const Port = 1;
let Other = 2, { Hidden } = values;
function Factory() {}
enum Mode { On }
export class Handler { constructor(port: Port, other: Other, hidden: Hidden, factory: Factory, mode: Mode, engine: Engine) {} }
class Engine {}`)).toEqual([
      'Handler[Symbol.for("kernel.dependencies")] = [{ name: "port", token: () => Port }, { name: "other", token: () => Other }, { name: "hidden" }, ' +
      '{ name: "factory", token: () => Factory }, { name: "mode", token: () => Mode }, { name: "engine", token: () => Engine }];'
    ]);
  });

  test("a type without a token: a type of the module, of a package, of a namespace, a keyword or a type that is not a name", () => {
    expect(written(`import type { Schema } from "zod";
import * as ports from "./ports.js";
type Local = string;
class Handler { constructor(local: Local, schema: Schema, port: ports.Port, text: string, either: A | B, list: Array<string>, nothing) {} }`)).toEqual([
      'Handler[Symbol.for("kernel.dependencies")] = [{ name: "local" }, { name: "schema" }, { name: "port" }, { name: "text" }, { name: "either" }, { name: "list" }, { name: "nothing" }];'
    ]);
  });

  test("a parameter with a default value, or marked optional, is optional; a parameter that is not a name is named by its position", () => {
    expect(written(`import type { Clock } from "./Clock.js";
class Handler { constructor(private clock: Clock = system, readonly limit = 3, label?: string, { a }: Options, ...rest: Clock[]) {} }`)).toEqual([
      'import * as __dependencies_0 from "./Clock.js";',
      'Handler[Symbol.for("kernel.dependencies")] = [{ name: "clock", token: () => __dependencies_0["Clock"], optional: true }, { name: "limit", optional: true }, ' +
      '{ name: "label", optional: true }, { name: "#3" }, { name: "#4" }];'
    ]);
  });

  test("declares each class that has a constructor, even one without parameters, and the default class when it has a name", () => {
    expect(written(`export class Empty { constructor() {} }
class Plain {}
export class Child extends Empty { method() {} }
export default class Main { constructor(name: string) {} }`)).toEqual([
      'Empty[Symbol.for("kernel.dependencies")] = [];',
      'Main[Symbol.for("kernel.dependencies")] = [{ name: "name" }];'
    ]);
  });

  test("names each token declared without a name after its constant", () => {
    expect(written(`import { Token } from "../Token.js";
export interface Clock {}
export const Clock = new Token<Clock>();
const Named = new Token<string>("named"), Other = new Thing(), Built = make(), Empty = new Token, Plain = 1;
const Wrapped = new tokens.Token();
let Later;`)).toEqual(['Clock.name = "Clock";', 'Empty.name = "Empty";']);
  });

  test("leaves a module without a class to build as it is", () => {
    expect(written(`export const a = 1;
export { a as b };
export default function () {}
class Plain {}`)).toBeUndefined();
    expect(written("export default class { constructor(name: string) {} }")).toBeUndefined();
  });
});
