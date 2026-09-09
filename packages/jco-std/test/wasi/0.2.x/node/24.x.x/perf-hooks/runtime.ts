import { afterEach, expect, test, vi } from "vitest";

import { node, p, resetTimelines, shim } from "../helpers/perf-hooks.js";

afterEach(() => {
  vi.unstubAllGlobals();
  resetTimelines();
});

test("uses monotonic runtime clock", () => {
  const before = node.performance.now();
  expect(p.now()).toBeGreaterThanOrEqual(before);
  expect(p.now()).toBeLessThanOrEqual(node.performance.now());
});

test("uses runtime time origin", () => {
  expect(p.timeOrigin).toBe(node.performance.timeOrigin);
});

test("explicit timestamps work without runtime clocks and missing clocks fail lazily", () => {
  vi.stubGlobal("performance", undefined);
  expect(p.mark("explicit", { startTime: 0 }).startTime).toBe(0);
  expect(p.measure("explicit", { start: 0, end: 2 }).duration).toBe(2);
  expect(() => p.now()).toThrow(expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }));
  expect(() => p.timeOrigin).toThrow(
    expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
  );
});

test("does not silently alias detail when structuredClone is unavailable", () => {
  vi.stubGlobal("structuredClone", undefined);
  expect(p.mark("empty", { startTime: 0 }).detail).toBeNull();
  expect(() => p.mark("detail", { startTime: 0, detail: {} })).toThrow(
    expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
  );
});

test("missing scheduler is rejected by observe before subscribing", () => {
  vi.stubGlobal("setTimeout", undefined);
  const observer = new shim.PerformanceObserver(() => {});
  expect(shim.PerformanceObserver.supportedEntryTypes).toEqual([]);
  expect(() => observer.observe({ type: "mark" })).toThrow(
    expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
  );
  p.mark("safe", { startTime: 0 });
  expect(observer.takeRecords()).toEqual([]);
});
