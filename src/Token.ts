/**
 * Stands for a dependency, with its type: a binding says what it stands for, and a test reads or replaces the dependency by its token.
 * A token declared without a name gets the name of its constant from the build (see declareDependencies).
 */
export class Token<T> {
  declare protected readonly type?: T;
  constructor(readonly name = "") {}
}
