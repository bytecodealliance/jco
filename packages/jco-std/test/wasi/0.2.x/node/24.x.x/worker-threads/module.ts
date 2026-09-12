import native from "node:worker_threads";
import { expect, test } from "vitest";
import { portable } from "../helpers/worker-threads.js";

test("Node 24.20 module shape and main-thread state, without consulting a provider", () => {
  const { workerThreads: shim } = portable();
  expect(Object.keys(shim).sort()).toEqual(Object.keys(native).sort());
  for (const key of [
    "isMainThread",
    "isInternalThread",
    "threadId",
    "threadName",
    "parentPort",
    "workerData",
    "SHARE_ENV",
  ] as const) {
    expect(shim[key]).toBe(native[key]);
  }
  expect(shim.resourceLimits).toEqual({});
  expect(Object.getOwnPropertyNames(shim.Worker.prototype).sort()).toEqual(
    [
      ...Object.getOwnPropertyNames(native.Worker.prototype).filter((key) => key !== "performance"),
      "performance",
    ].sort(),
  );
});
