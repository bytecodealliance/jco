import { afterEach, expect, test, vi } from "vitest";

import { RESOURCE_INFO, node, p, resetTimelines, resource, shim } from "../helpers/perf-hooks.js";

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

test("drops overflow entries the listener does not make room for", async () => {
  p.setResourceTimingBufferSize(1);
  resource("first");
  const full = vi.fn();
  await new Promise<void>((resolve) => {
    p.onresourcetimingbufferfull = () => {
      full();
      resolve();
    };
    resource("second");
  });
  expect(full).toHaveBeenCalledTimes(1);
  expect(p.getEntriesByType("resource").map((e) => e.name)).toEqual(["first"]);
  p.onresourcetimingbufferfull = null;
  p.setResourceTimingBufferSize(250);
});

test("replaces the buffer-full handler instead of stacking it", async () => {
  p.setResourceTimingBufferSize(1);
  resource("first");
  const stale = vi.fn();
  p.onresourcetimingbufferfull = stale;
  await new Promise<void>((resolve) => {
    p.onresourcetimingbufferfull = () => {
      p.clearResourceTimings();
      resolve();
    };
    resource("second");
  });
  expect(stale).not.toHaveBeenCalled();
  expect(p.onresourcetimingbufferfull).not.toBe(stale);
  p.onresourcetimingbufferfull = null;
  p.setResourceTimingBufferSize(250);
});

test("coerces the buffer size like Node", async () => {
  for (const perf of [p, node.performance]) {
    perf.setResourceTimingBufferSize("2" as never);
    const full = new Promise<void>((resolve) => {
      perf.addEventListener(
        "resourcetimingbufferfull",
        () => {
          perf.clearResourceTimings();
          resolve();
        },
        { once: true },
      );
    });
    for (const name of ["a", "b", "c"]) {
      perf.markResourceTiming(RESOURCE_INFO, name, "fetch", globalThis, "", {}, 200);
    }
    expect(perf.getEntriesByType("resource")).toHaveLength(2);
    await full;
    perf.setResourceTimingBufferSize(250);
  }
});
