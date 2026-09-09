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
test("clearResourceTimings clears only matching type and name", () => {
  p.mark("", { startTime: 0 });
  p.mark("keep", { startTime: 1 });
  p.measure("", { start: 0, end: 2 });
  p.markResourceTiming(
    { startTime: 0, endTime: 1, encodedBodySize: 1, decodedBodySize: 1 },
    "",
    "fetch",
    globalThis,
    "",
    {},
    200,
  );
  p.clearResourceTimings("");
  expect(p.getEntriesByName("").map((e) => e.entryType)).not.toContain("resource");
  p.clearResourceTimings();
  expect(p.getEntriesByType("resource")).toEqual([]);
});
