import { afterEach, expect, test } from "vitest";

import { node, p, resetTimelines, shim } from "../helpers/perf-hooks.js";

afterEach(resetTimelines);

test("constructs detached marks, preserves zero and clones detail", () => {
  const detail = { nested: [1] };
  const a = new shim.PerformanceMark("a", { startTime: 0, detail });
  const b = new node.PerformanceMark("a", { startTime: 0, detail });
  detail.nested.push(2);
  expect(a.toJSON()).toEqual(b.toJSON());
  expect(p.getEntries()).toEqual([]);
  expect(a).toBeInstanceOf(shim.PerformanceEntry);
  expect(Object.prototype.toString.call(a)).toBe("[object PerformanceMark]");
});

test.each([-1, -Infinity])("rejects timestamp %s", (startTime) => {
  expect(() => new shim.PerformanceMark("a", { startTime })).toThrow(
    expect.objectContaining({ code: "ERR_PERFORMANCE_INVALID_TIMESTAMP" }),
  );
});

test("rejects missing names and uncloneable detail", () => {
  expect(() => Reflect.construct(shim.PerformanceMark, [])).toThrow(
    expect.objectContaining({ code: "ERR_MISSING_ARGS" }),
  );
  expect(() => new shim.PerformanceMark("a", { detail: () => {} })).toThrow(
    expect.objectContaining({ name: "DataCloneError" }),
  );
});

test("records marks with fixed zero duration and checks names", () => {
  expect(p.mark("x", { startTime: 2 }).toJSON()).toEqual(
    node.performance.mark("x", { startTime: 2 }).toJSON(),
  );
  expect(p.getEntries()).toHaveLength(1);
  expect(() => p.mark("nodeStart")).toThrow(
    expect.objectContaining({ code: "ERR_INVALID_ARG_VALUE" }),
  );
  expect(() => Reflect.apply(p.mark, p, [])).toThrow(
    expect.objectContaining({ code: "ERR_MISSING_ARGS" }),
  );
});

function markBoth(): void {
  for (const perf of [p, node.performance]) {
    perf.mark("a", { startTime: 1 });
    perf.mark("a", { startTime: 3 });
    perf.mark("b", { startTime: 8 });
  }
}

test.each([
  { start: 0, end: 10 },
  { start: 2, duration: 3 },
  { end: 7, duration: 4 },
  { start: "a", end: "b" },
  { start: 9, end: 2 },
])("matches explicit measure overload %j", (options) => {
  markBoth();
  expect(p.measure("m", options).toJSON()).toEqual(node.performance.measure("m", options).toJSON());
});

test("uses latest mark, independent detail, fixed duration and string overload", () => {
  markBoth();
  expect(p.measure("m", "a", "b").toJSON()).toEqual(
    node.performance.measure("m", "a", "b").toJSON(),
  );
  const detail = { x: [1] };
  const entry = p.measure("m", { start: 0, end: 2, detail });
  detail.x.push(2);
  expect(entry.toJSON()).toEqual({
    name: "m",
    entryType: "measure",
    startTime: 0,
    duration: 2,
    detail: { x: [1] },
  });
});

test("validates options and unresolved marks", () => {
  expect(() => p.measure("m", "missing")).toThrow(
    expect.objectContaining({ name: "SyntaxError", code: 12 }),
  );
  expect(() => p.measure("m", { start: 0, end: 1, duration: 1 })).toThrow(
    expect.objectContaining({ code: "ERR_PERFORMANCE_MEASURE_INVALID_OPTIONS" }),
  );
  expect(() => p.measure("m", { start: 0 }, "b")).toThrow(
    expect.objectContaining({ code: "ERR_PERFORMANCE_MEASURE_INVALID_OPTIONS" }),
  );
});
