import { test, expect, vi } from "vitest";
import {
  performance,
  PerformanceObserver,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/perf-hooks.js";

test("explicit timestamps work without runtime clocks and missing clocks fail lazily", () => {
  vi.stubGlobal("performance", undefined);
  try {
    expect(performance.mark("explicit", { startTime: 0 }).startTime).toBe(0);
    expect(performance.measure("explicit", { start: 0, end: 2 }).duration).toBe(2);
    expect(() => performance.now()).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
    );
    expect(() => performance.timeOrigin).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
    );
  } finally {
    vi.unstubAllGlobals();
    performance.clearMarks();
    performance.clearMeasures();
  }
});

test("does not silently alias detail when structuredClone is unavailable", () => {
  vi.stubGlobal("structuredClone", undefined);
  try {
    expect(performance.mark("empty", { startTime: 0 }).detail).toBeNull();
    expect(() => performance.mark("detail", { startTime: 0, detail: {} })).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
    );
  } finally {
    vi.unstubAllGlobals();
    performance.clearMarks();
  }
});

test("missing scheduler is rejected by observe before subscribing", () => {
  vi.stubGlobal("setTimeout", undefined);
  try {
    const observer = new PerformanceObserver(() => {});
    expect(PerformanceObserver.supportedEntryTypes).toEqual([]);
    expect(() => observer.observe({ type: "mark" })).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
    );
    performance.mark("safe", { startTime: 0 });
    expect(observer.takeRecords()).toEqual([]);
  } finally {
    vi.unstubAllGlobals();
    performance.clearMarks();
  }
});
