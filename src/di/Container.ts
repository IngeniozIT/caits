import { Token } from "../Token.js";

/** What the build writes next to each class: the parameters of its constructor, in order. */
export const DEPENDENCIES = Symbol.for("kernel.dependencies");

/**
 * A parameter of a constructor: its name, and the token of its type when the type has one (a port and its token, or a class). The name
 * of the type goes with its token: if the module of the type declares no token, the error names the type.
 */
export type Dependency = { readonly name: string; readonly type?: string; readonly token?: () => unknown; readonly optional?: true };

export type Concrete<T = unknown> = new (...args: never[]) => T;
export type Key<T = unknown> = Token<T> | (abstract new (...args: never[]) => T);

/** How the container gets what a key stands for: it builds a class, it gives a value, or it makes the value when something needs it. */
export type Binding =
  | { readonly key: Key; readonly to: Concrete; readonly values: Readonly<Record<string, unknown>> }
  | { readonly key: Key; readonly value: unknown }
  | { readonly key: Key; readonly make: () => unknown };

type ClassBinding<T> = Binding & {
  /** The values of some parameters of the class, by their names. */
  with(values: Readonly<Record<string, unknown>>): ClassBinding<T>;
};

const toClass = <T>(key: Key<T>, to: Concrete, values: Readonly<Record<string, unknown>>): ClassBinding<T> =>
  ({ key, to, values, with: more => toClass(key, to, { ...values, ...more }) });

/**
 * Says what a key stands for: `bind(Port).to(Adapter)`, `bind(Token).toValue(value)`, `bind(Token).toFactory(() => value)`,
 * `bind(SomeClass).with({ parameter: value })`.
 */
export function bind<T>(key: Key<T>) {
  return {
    to: <I extends T>(implementation: Concrete<I>): ClassBinding<T> => toClass(key, implementation, {}),
    toValue: (value: T): Binding => ({ key, value }),
    toFactory: (make: () => T): Binding => ({ key, make }),
    with: (values: Readonly<Record<string, unknown>>): ClassBinding<T> => toClass(key, key as Concrete, values)
  };
}

const describe = (route: readonly Key[]) => route.map(key => key.name).join(" → ");
const isKey = (value: unknown): value is Key => value instanceof Token || typeof value === "function";

/**
 * Builds a class with its dependencies, and the dependencies of its dependencies. A key without a binding is built if it is a class.
 * Each key gives one instance; `create` gives a new instance of a class each time. A child container (for a request) has bindings of
 * its own, and asks its parent for the others: what the parent builds never depends on what only the child binds.
 */
export class Container {
  private readonly bindings = new Map<Key, Binding>();
  private readonly built = new Map<Key, unknown>();

  constructor(bindings: readonly Binding[] = [], private readonly parent?: Container) {
    for (const binding of bindings) this.bindings.set(binding.key, binding);
  }

  /** A container whose bindings come first, and which asks this container for the others. */
  child(bindings: readonly Binding[]): Container {
    return new Container(bindings, this);
  }

  /** Tells if a binding of this container, or of its parents, says what this key stands for. */
  has(key: Key): boolean {
    return this.bindings.has(key) || this.parent?.has(key) === true;
  }

  /** The instance of a key: built the first time something needs it, then kept. */
  get<T>(key: Key<T>): T {
    return this.resolve(key, [], true) as T;
  }

  /** A new instance of a class, with its dependencies. */
  create<T>(type: Concrete<T>): T {
    return this.build(type, {}, [type], true) as T;
  }

  /** Makes sure that the container can build a class: each dependency has a binding, a value or a default. It builds nothing. */
  check(type: Concrete): void {
    this.build(type, {}, [type], false);
  }

  /** From now on, this value stands for the key. */
  use<T, Given extends T>(key: Key<T>, value: Given): Given {
    this.bindings.set(key, { key, value });
    return value;
  }

  private resolve(key: Key, path: readonly Key[], make: boolean): unknown {
    const binding = this.bindings.get(key);
    if (!binding && this.parent?.has(key)) return this.parent.resolve(key, path, make);
    if (binding && "value" in binding) return binding.value;
    if (this.built.has(key)) return this.built.get(key);
    const route = [...path, key];
    if (path.includes(key)) throw new Error(`Circular dependency: ${describe(route)}`);
    if (!binding && key instanceof Token) throw new Error(`Nothing is bound to ${describe(route)}`);
    const instance = !binding ? this.build(key as Concrete, {}, route, make)
      : "make" in binding ? (make ? binding.make() : undefined)
      : this.build(binding.to, binding.values, route, make);
    if (make) this.built.set(key, instance);
    return instance;
  }

  private build(type: Concrete, values: Readonly<Record<string, unknown>>, path: readonly Key[], make: boolean): unknown {
    const dependencies = (type as unknown as { [DEPENDENCIES]?: readonly Dependency[] })[DEPENDENCIES];
    if (!dependencies && type.length > 0) throw new Error(`${type.name} declares no dependencies: the build must run the dependencies plugin`);
    for (const name of Object.keys(values)) {
      if (!dependencies?.some(dependency => dependency.name === name)) throw new Error(`${type.name} has no parameter named ${name}`);
    }
    const args = (dependencies ?? []).map(({ name, type: typeName, token, optional }) => {
      if (Object.hasOwn(values, name)) return values[name];
      const key = token?.();
      // An optional parameter keeps its default value when its type has no token, or when nothing is bound to its token.
      if (optional && (!isKey(key) || (key instanceof Token && !this.has(key)))) return undefined;
      if (isKey(key)) return this.resolve(key, path, make);
      const bound = path[path.length - 1];
      const binding = bound === type ? `bind(${type.name})` : `bind(${bound.name}).to(${type.name})`;
      const noToken = typeName ? `its type ${typeName} has no token (export const ${typeName} = new Token<${typeName}>()), or ` : "";
      throw new Error(`${describe(path)} needs a value for its parameter ${name}: ${noToken}give it with ${binding}.with({ ${name}: … })`);
    });
    return make ? new type(...(args as never[])) : undefined;
  }
}
