import { expect, test } from "vitest";

import { matchesNode, p, shim } from "../helpers/perf-hooks.js";

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

test.each([
  ["Performance", shim.Performance.prototype, "getEntries"],
  ["PerformanceEntry", shim.PerformanceEntry.prototype, "name"],
  ["PerformanceMark", shim.PerformanceMark.prototype, "detail"],
  ["PerformanceResourceTiming", shim.PerformanceResourceTiming.prototype, "transferSize"],
  ["PerformanceObserver", shim.PerformanceObserver.prototype, "takeRecords"],
  ["PerformanceObserverEntryList", shim.PerformanceObserverEntryList.prototype, "getEntries"],
])("%s members reject forged receivers", (name, prototype, member) => {
  const { get, value } = Object.getOwnPropertyDescriptor(prototype, member)!;
  expect(() => Reflect.apply(get ?? value, {}, [])).toThrow(
    expect.objectContaining({
      code: "ERR_INVALID_THIS",
      message: `Value of "this" must be of type ${name}`,
    }),
  );
});

test("presents constructor and receiver errors like Node", () => {
  matchesNode((m) => Reflect.construct(m.PerformanceMeasure, []));
  matchesNode((m) => Reflect.get(m.PerformanceEntry.prototype, "name", {}));
});
