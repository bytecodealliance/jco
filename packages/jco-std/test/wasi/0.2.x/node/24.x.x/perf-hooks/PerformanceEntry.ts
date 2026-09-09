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
test("PerformanceEntry rejects direct construction", () => {
  expect(() => new shim.PerformanceEntry()).toThrow(
    expect.objectContaining({ code: "ERR_ILLEGAL_CONSTRUCTOR" }),
  );
});

test("rejects forged entry receivers with Node error fields", () => {
  expect(() => Reflect.apply(shim.PerformanceEntry.prototype.toJSON, {}, [])).toThrow(
    expect.objectContaining({ code: "ERR_INVALID_THIS" }),
  );
});
