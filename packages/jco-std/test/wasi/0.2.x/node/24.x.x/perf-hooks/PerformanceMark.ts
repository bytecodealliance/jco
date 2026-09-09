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
