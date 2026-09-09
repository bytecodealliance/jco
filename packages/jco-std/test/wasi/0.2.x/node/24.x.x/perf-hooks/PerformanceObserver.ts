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
test("buffers synchronously, drains and disconnects", () => {
  const observer = new shim.PerformanceObserver(() => {});
  observer.observe({ entryTypes: ["mark", "measure"] });
  p.mark("x", { startTime: 3 });
  p.measure("x", { start: 0, end: 5 });
  expect(observer.takeRecords().map((e) => e.entryType)).toEqual(["mark", "measure"]);
  expect(observer.takeRecords()).toEqual([]);
  observer.disconnect();
  p.mark("y", { startTime: 4 });
  expect(observer.takeRecords()).toEqual([]);
});
test("delivers sorted asynchronous entries and buffered records", async () => {
  p.mark("old", { startTime: 1 });
  await new Promise<void>((resolve) => {
    const observer = new shim.PerformanceObserver((list, self) => {
      expect(self).toBe(observer);
      expect(list.getEntriesByType("mark").map((e) => e.name)).toEqual(["old", "new"]);
      expect(list.getEntriesByName("old")).toHaveLength(1);
      self.disconnect();
      resolve();
    });
    observer.observe({ type: "mark", buffered: true });
    p.mark("new", { startTime: 2 });
  });
});
test("enforces observation mode until disconnect", () => {
  const observer = new shim.PerformanceObserver(() => {});
  observer.observe({ type: "mark" });
  expect(() => observer.observe({ entryTypes: ["measure"] })).toThrow(
    expect.objectContaining({ name: "InvalidModificationError" }),
  );
  observer.disconnect();
  observer.observe({ entryTypes: ["measure"] });
  observer.disconnect();
  expect(() => observer.observe()).toThrow(expect.objectContaining({ code: "ERR_MISSING_ARGS" }));
});
