import { afterEach, expect, test } from "vitest";

import { matchesNode, p, resetTimelines, shim } from "../helpers/perf-hooks.js";

afterEach(resetTimelines);

test("preserves this, arguments, result, descriptors and function records", () => {
  const observer = new shim.PerformanceObserver(() => {});
  observer.observe({ type: "function" });
  function add(this: { base: number }, n: number): number {
    return this.base + n;
  }
  const wrapped = shim.timerify(add);
  expect(wrapped.call({ base: 2 }, 3)).toBe(5);
  expect(wrapped.name).toBe("timerified add");
  expect(wrapped.length).toBe(1);
  const [entry] = observer.takeRecords();
  expect(entry.entryType).toBe("function");
  expect(entry.toJSON().detail).toEqual([3]);
  expect(p.getEntriesByType("function")).toEqual([]);
  observer.disconnect();
});

test("records async settlement and construction, but not synchronous exceptions", async () => {
  const observer = new shim.PerformanceObserver(() => {});
  observer.observe({ type: "function" });
  expect(await shim.timerify(async () => 7)()).toBe(7);
  class Box {
    constructor(public value: number) {}
  }
  const Timed = shim.timerify(Box);
  expect(new Timed(3)).toBeInstanceOf(Box);
  expect(() =>
    shim.timerify(() => {
      throw new Error("boom");
    })(),
  ).toThrow("boom");
  expect(observer.takeRecords()).toHaveLength(2);
  observer.disconnect();
});

test("deprecated node entry fields fail immediately", () => {
  const observer = new shim.PerformanceObserver(() => {});
  observer.observe({ type: "function" });
  shim.timerify(() => 1)();
  const [entry] = observer.takeRecords();
  observer.disconnect();
  for (const key of ["kind", "flags"]) {
    expect(() => Reflect.get(entry, key)).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API" }),
    );
  }
});

test("reads a thenable finally without invoking a proxy has trap", () => {
  const value = new Proxy(
    {
      finally(callback: () => void) {
        callback();
        return 9;
      },
    },
    {
      has() {
        throw new Error("unexpected has trap");
      },
    },
  );
  expect(shim.timerify(() => value)()).toBe(9);
});

test("matches Node's validation errors, including their presentation", () => {
  matchesNode((m) => m.timerify(1 as never));
  matchesNode((m) => m.timerify(() => 1, 5 as never));
  matchesNode((m) => m.timerify(() => 1, { histogram: 5 as never }));
});
