import { test, expect, afterEach } from "vitest";
import node from "node:perf_hooks";
import shim from "../../../../../../src/wasi/0.2.x/node/24.x.x/perf-hooks.js";
const { performance: p } = shim;
afterEach(() => {
  p.clearMarks();
  p.clearMeasures();
  p.clearResourceTimings();
  node.performance.clearMarks();
  node.performance.clearMeasures();
});
test.each([
  { start: 0, end: 10 },
  { start: 2, duration: 3 },
  { end: 7, duration: 4 },
  { start: "a", end: "b" },
  { start: 9, end: 2 },
])("matches explicit measure overload %j", (options) => {
  for (const perf of [p, node.performance]) {
    perf.mark("a", { startTime: 1 });
    perf.mark("a", { startTime: 3 });
    perf.mark("b", { startTime: 8 });
  }
  expect(p.measure("m", options).toJSON()).toEqual(node.performance.measure("m", options).toJSON());
});
test("uses latest mark, independent detail, fixed duration and string overload", () => {
  for (const perf of [p, node.performance]) {
    perf.mark("a", { startTime: 1 });
    perf.mark("a", { startTime: 3 });
    perf.mark("b", { startTime: 8 });
  }
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
