import { describe, expect, test, vi } from "vitest";
import { Token } from "../Token.js";
import { bind, Container } from "./Container.js";

interface Clock { now(): string }
const Clock = new Token<Clock>();
class FixedClock implements Clock {
  now(): string { return "noon"; }
}
class Engine {}
class Car {
  constructor(readonly engine: Engine, readonly clock: Clock) {}
}
class Greeter {
  constructor(readonly greeting: string, readonly clock: Clock) {}
}
class Garage {
  constructor(readonly car: Car, readonly opening = "9:00") {}
}
class Radio {
  constructor(readonly clock: Clock = { now: () => "default" }, readonly station?: string) {}
}
class Truck extends Car {}
type Limit = number;
const Limit = 3;
class Gauge {
  constructor(readonly limit: Limit) {}
}
class Chicken {
  constructor(readonly egg: Egg) {}
}
class Egg {
  constructor(readonly chicken: Chicken) {}
}
const hidden = () => class Hidden { constructor(readonly name: string) {} };
class Counted {
  static made = 0;
  constructor() { Counted.made++; }
}
class Shop {
  constructor(readonly counted: Counted, readonly clock: Clock) {}
}

describe("a container", () => {
  test("builds a class with its dependencies, and with the dependencies of these", () => {
    const car = new Container([bind(Clock).to(FixedClock)]).get(Car);
    expect(car.engine).toBeInstanceOf(Engine);
    expect(car.clock.now()).toBe("noon");
  });

  test("gives a value bound to a token", () => {
    const clock = { now: () => "midnight" };
    expect(new Container([bind(Clock).toValue(clock)]).get(Clock)).toBe(clock);
  });

  test("gives the values of some parameters by their names, after a class or on the class itself", () => {
    const container = new Container([
      bind(Clock).to(FixedClock),
      bind(Greeter).with({ greeting: "Hello" }).with({ greeting: "Hi" }),
      bind(Garage).to(Garage).with({ opening: "8:00" })
    ]);
    expect(container.get(Greeter).greeting).toBe("Hi");
    expect(container.get(Garage).opening).toBe("8:00");
  });

  test("makes a value the first time something needs it, then keeps it; a check makes nothing", () => {
    const make = vi.fn(() => ({ now: () => "dawn" }));
    const container = new Container([bind(Clock).toFactory(make)]);
    container.check(Car);
    expect(make).not.toHaveBeenCalled();
    expect(container.get(Car).clock.now()).toBe("dawn");
    expect(container.get(Clock)).toBe(container.get(Car).clock);
    expect(make).toHaveBeenCalledTimes(1);
  });

  test("the last binding of a key wins", () => {
    const clock = { now: () => "midnight" };
    expect(new Container([bind(Clock).to(FixedClock), bind(Clock).toValue(clock)]).get(Clock)).toBe(clock);
  });

  test("gives one instance for each key, and a new instance each time it creates a class", () => {
    const container = new Container([bind(Clock).to(FixedClock)]);
    expect(container.get(Car)).toBe(container.get(Car));
    expect(container.get(Clock)).toBe(container.get(Clock));
    const created = container.create(Car);
    expect(created).not.toBe(container.create(Car));
    expect(created).not.toBe(container.get(Car));
    expect(created.engine).toBe(container.get(Engine));
  });

  test("an optional parameter keeps its default value when its type has no token, or when nothing is bound to its token", () => {
    const container = new Container();
    expect(container.get(Radio).clock.now()).toBe("default");
    expect(container.get(Radio).station).toBeUndefined();
    expect(new Container([bind(Clock).to(FixedClock)]).get(Radio).clock.now()).toBe("noon");
    expect(new Container([bind(Clock).to(FixedClock)]).get(Garage).opening).toBe("9:00");
  });

  test("a class without a constructor of its own is built with the dependencies of its parent", () => {
    expect(new Container([bind(Clock).to(FixedClock)]).get(Truck).engine).toBeInstanceOf(Engine);
  });

  test("checks that it can build a class, without building anything", () => {
    const container = new Container([bind(Clock).to(FixedClock)]);
    container.check(Shop);
    expect(Counted.made).toBe(0);
    expect(container.get(Shop).counted).toBeInstanceOf(Counted);
    expect(Counted.made).toBe(1);
    expect(() => new Container().check(Shop)).toThrow("Nothing is bound to Shop → Clock");
  });

  test("tells which keys a binding covers", () => {
    const container = new Container([bind(Clock).to(FixedClock)]);
    expect(container.has(Clock)).toBe(true);
    expect(container.has(Car)).toBe(false);
  });

  test("uses the value it is given for a key from now on, even after it built its own", () => {
    const container = new Container([bind(Clock).to(FixedClock)]);
    expect(container.get(Clock).now()).toBe("noon");
    const clock = { now: () => "midnight" };
    expect(container.use(Clock, clock)).toBe(clock);
    expect(container.get(Clock)).toBe(clock);
    expect(container.create(Car).clock).toBe(clock);
    expect(container.has(Clock)).toBe(true);
  });

  describe("a child container, for a narrower life", () => {
    test("asks its parent for what it does not bind: the parent builds it once for all its children", () => {
      const parent = new Container([bind(Clock).to(FixedClock)]);
      const first = parent.child([bind(Greeter).with({ greeting: "Hi" })]);
      const second = parent.child([]);
      expect(first.get(Greeter).clock).toBe(parent.get(Clock));
      expect(second.get(Clock)).toBe(parent.get(Clock));
      expect([first.has(Clock), first.has(Greeter), parent.has(Greeter)]).toEqual([true, true, false]);
    });

    test("its own bindings come first", () => {
      const clock = { now: () => "midnight" };
      const parent = new Container([bind(Clock).to(FixedClock)]);
      expect(parent.child([bind(Clock).toValue(clock)]).get(Car).clock).toBe(clock);
      expect(parent.get(Clock).now()).toBe("noon");
    });

    test("builds and keeps for itself a class that nobody binds", () => {
      const parent = new Container([bind(Clock).to(FixedClock)]);
      const child = parent.child([]);
      expect(child.get(Engine)).toBe(child.get(Engine));
      expect(child.get(Engine)).not.toBe(parent.get(Engine));
    });

    test("sees what its parent uses from now on", () => {
      const parent = new Container([bind(Clock).to(FixedClock)]);
      const child = parent.child([]);
      const clock = parent.use(Clock, { now: () => "midnight" });
      expect(child.get(Clock)).toBe(clock);
    });

    test("what the parent binds never depends on what only the child binds", () => {
      const child = new Container([bind(Car).to(Car)]).child([bind(Clock).to(FixedClock)]);
      expect(() => child.get(Car)).toThrow("Nothing is bound to Car → Clock");
      expect(() => child.check(Shop)).not.toThrow();
    });
  });

  describe("says what is wrong", () => {
    test("a token that nothing is bound to, and the way to it", () => {
      expect(() => new Container().get(Clock)).toThrow("Nothing is bound to Clock");
      expect(() => new Container().get(Car)).toThrow("Nothing is bound to Car → Clock");
    });

    test("a parameter whose type has no token, and how to give its value", () => {
      expect(() => new Container([bind(Clock).to(FixedClock)]).get(Greeter)).toThrow("Greeter needs a value for its parameter greeting: give it with bind(Greeter).with({ greeting: … })");
      expect(() => new Container().get(Gauge)).toThrow("Gauge needs a value for its parameter limit: give it with bind(Gauge).with({ limit: … })");
      expect(new Container([bind(Gauge).with({ limit: 5 })]).get(Gauge).limit).toBe(5);
    });

    test("a value for a parameter that the class does not have", () => {
      expect(() => new Container([bind(Engine).with({ power: 1 })]).get(Engine)).toThrow("Engine has no parameter named power");
      expect(() => new Container([bind(Clock).to(FixedClock), bind(Car).with({ engine: new Engine(), wheels: 4 })]).get(Car)).toThrow("Car has no parameter named wheels");
    });

    test("classes that need each other", () => {
      expect(() => new Container().get(Chicken)).toThrow("Circular dependency: Chicken → Egg → Chicken");
    });

    test("a class whose dependencies the build did not write", () => {
      expect(() => new Container().create(hidden())).toThrow("Hidden declares no dependencies: the build must run the dependencies plugin");
    });
  });
});
