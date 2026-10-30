import { describe, expect, test, vi } from "vitest";

/** The kernel and the backend of the same fresh modules. */
const fresh = async () => {
  vi.resetModules();
  return { ...await import("./kernel.js"), ...await import("../di/backend.js") };
};

describe("the kernel of the server", () => {
  test("boots the backend with the bindings of the di.ts of the contexts, and starts its timers", async () => {
    vi.useFakeTimers();
    try {
      const { boot, backend } = await fresh();
      await boot();
      const told: unknown[] = [];
      backend().subscribeToContexts(event => told.push(event));

      await vi.advanceTimersByTimeAsync(60_000);

      expect(told).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test("a backend whose timers cannot start stops at once, and its boot fails: nothing serves with it", async () => {
    const { boot, backend } = await fresh();
    let booted: unknown;
    const schedule = () => {
      booted = backend();
      throw new Error("no clock");
    };

    await expect(boot({ schedule })).rejects.toThrow("no clock");

    expect(booted).toBeDefined();
    expect(backend()).not.toBe(booted);
  });

  test("gives what stops it: the timers, then the backend, which the next use starts again", async () => {
    vi.useFakeTimers();
    try {
      const { boot, backend } = await fresh();
      const stop = await boot();
      const booted = backend();
      const told: unknown[] = [];
      booted.subscribeToContexts(event => told.push(event));

      await stop(Promise.resolve(), AbortSignal.abort());
      await vi.advanceTimersByTimeAsync(60_000);

      expect(told).toEqual([]);
      expect(backend()).not.toBe(booted);
    } finally {
      vi.useRealTimers();
    }
  });
});
