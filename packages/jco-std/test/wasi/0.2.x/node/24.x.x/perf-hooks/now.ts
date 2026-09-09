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
test("uses monotonic runtime clock", () => {
  const before = node.performance.now();
  expect(p.now()).toBeGreaterThanOrEqual(before);
  expect(p.now()).toBeLessThanOrEqual(node.performance.now());
});
