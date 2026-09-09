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
test("dispatches overflow and preserves entries when listener clears buffer", async () => {
  p.setResourceTimingBufferSize(1);
  const info = { startTime: 0, endTime: 1, encodedBodySize: 0, decodedBodySize: 0 };
  p.markResourceTiming(info, "first", "fetch", globalThis, "", {}, 200);
  await new Promise<void>((resolve) => {
    p.onresourcetimingbufferfull = () => {
      p.clearResourceTimings();
      resolve();
    };
    p.markResourceTiming(info, "second", "fetch", globalThis, "", {}, 200);
  });
  expect(p.getEntriesByType("resource").map((e) => e.name)).toEqual(["second"]);
  p.onresourcetimingbufferfull = null;
  p.setResourceTimingBufferSize(250);
});
