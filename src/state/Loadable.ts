/** Data that a view asked for: nobody asked yet, the answer is on its way, or it came back loaded or failed. */
export type Loadable<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; data: T }
  | { status: "failed"; message: string };

export type Settled<T> = Extract<Loadable<T>, { status: "loaded" | "failed" }>;

/** The answer, loaded or failed; undefined while nobody asked or the answer is on its way. */
export function settled<T>(loadable: Loadable<T>): Settled<T> | undefined {
  return loadable.status === "loaded" || loadable.status === "failed" ? loadable : undefined;
}
