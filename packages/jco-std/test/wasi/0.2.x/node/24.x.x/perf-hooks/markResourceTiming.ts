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
test("matches Node resource field formulas and cache semantics", () => {
  const info = {
    startTime: 2,
    endTime: 12,
    encodedBodySize: 30,
    decodedBodySize: 50,
    finalConnectionTimingInfo: {
      domainLookupStartTime: 3,
      connectionEndTime: 5,
      ALPNNegotiatedProtocol: "h2",
    },
  };
  for (const cache of ["", "local"] as const) {
    const actual = p.markResourceTiming(
      info,
      "https://example.test",
      "fetch",
      globalThis,
      cache,
      {},
      200,
    );
    const expected = node.performance.markResourceTiming(
      info,
      "https://example.test",
      "fetch",
      globalThis,
      cache,
      {},
      200,
    );
    expect(actual.toJSON()).toEqual(expected.toJSON());
    expect(actual).toBeInstanceOf(shim.PerformanceResourceTiming);
  }
  node.performance.clearResourceTimings();
});
