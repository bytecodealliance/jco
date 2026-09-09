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
test("getEntries returns a sorted independent list", () => {
  for (const perf of [p, node.performance]) {
    perf.mark("a", { startTime: 8 });
    perf.mark("b", { startTime: 0 });
    perf.mark("a", { startTime: 2 });
  }
  const entries = p.getEntries();
  expect(entries.map((e) => e.toJSON())).toEqual(
    node.performance.getEntries().map((e) => e.toJSON()),
  );
  entries.pop();
  expect(p.getEntries()).toHaveLength(3);
});
