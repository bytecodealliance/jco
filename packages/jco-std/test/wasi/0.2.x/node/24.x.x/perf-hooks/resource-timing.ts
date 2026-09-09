import { afterEach, expect, test } from "vitest";

import { node, p, resetTimelines, resource, shim } from "../helpers/perf-hooks.js";

afterEach(resetTimelines);

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

test("dispatches overflow and preserves entries when listener clears buffer", async () => {
  p.setResourceTimingBufferSize(1);
  resource("first");
  await new Promise<void>((resolve) => {
    p.onresourcetimingbufferfull = () => {
      p.clearResourceTimings();
      resolve();
    };
    resource("second");
  });
  expect(p.getEntriesByType("resource").map((e) => e.name)).toEqual(["second"]);
  p.onresourcetimingbufferfull = null;
  p.setResourceTimingBufferSize(250);
});
