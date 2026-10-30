import { describe, expect, test } from "vitest";
import type { MessageBus } from "./MessageBus.js";
import { TimerController } from "./TimerController.js";

class Measure {
  constructor(readonly turn: number) {}
}

class MeasuringController extends TimerController<Measure> {
  readonly every = 2000;
  private turn = 0;

  protected toDto(): Measure {
    this.turn++;
    if (this.turn === 2) throw new RangeError("no second turn");
    return new Measure(this.turn);
  }
}

function busDoing(execute: (dto: Measure) => Promise<unknown>) {
  const received: Measure[] = [];
  const reported: unknown[] = [];
  const bus: MessageBus = { send: (dto: object) => { received.push(dto as Measure); return execute(dto as Measure); } };
  return { received, reported, controller: new MeasuringController(bus, error => reported.push(error)) };
}

describe("TimerController", () => {
  test("says how often the kernel runs it", () => {
    expect(busDoing(() => Promise.resolve()).controller.every).toBe(2000);
  });

  test("gives the bus the DTO of each turn, and waits for its handler", async () => {
    let done = false;
    const { received, reported, controller } = busDoing(async () => { await Promise.resolve(); done = true; });
    await controller.tick();
    expect(received).toEqual([new Measure(1)]);
    expect(done).toBe(true);
    expect(reported).toEqual([]);
  });

  test("reports an error of its handler or of its DTO, and never throws it: the next turn comes anyway", async () => {
    const failure = new Error("the handler failed");
    const { received, reported, controller } = busDoing(() => Promise.reject(failure));
    await controller.tick();
    await controller.tick();
    expect(received).toEqual([new Measure(1)]);
    expect(reported).toEqual([failure, new RangeError("no second turn")]);
  });

  test("reports to the console when nobody says where", async () => {
    const bus: MessageBus = { send: () => Promise.reject(new Error("lost")) };
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (error: unknown) => { errors.push(error); };
    try {
      await new MeasuringController(bus).tick();
    } finally {
      console.error = original;
    }
    expect(errors).toEqual([new Error("lost")]);
  });
});
