import { expect, test } from "vitest";

import { p, shim } from "../helpers/perf-hooks.js";

test.each([
  ["Performance", shim.Performance],
  ["PerformanceEntry", shim.PerformanceEntry],
  ["PerformanceMeasure", shim.PerformanceMeasure],
  ["PerformanceObserverEntryList", shim.PerformanceObserverEntryList],
  ["PerformanceResourceTiming", shim.PerformanceResourceTiming],
])("%s rejects direct construction", (_, Class) => {
  expect(() => Reflect.construct(Class, [])).toThrow(
    expect.objectContaining({ code: "ERR_ILLEGAL_CONSTRUCTOR" }),
  );
});

test("validates the receiver before touching arguments", () => {
  const name = {
    toString() {
      throw new Error("coerced");
    },
  };
  expect(() => Reflect.apply(p.mark, {}, [name])).toThrow(
    expect.objectContaining({ code: "ERR_INVALID_THIS" }),
  );
  expect(() => Reflect.apply(p.now, null, [])).toThrow(
    expect.objectContaining({ code: "ERR_INVALID_THIS" }),
  );
});

test("rejects forged entry receivers with Node error fields", () => {
  expect(() => Reflect.apply(shim.PerformanceEntry.prototype.toJSON, {}, [])).toThrow(
    expect.objectContaining({ code: "ERR_INVALID_THIS" }),
  );
});
