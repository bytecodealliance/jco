import native from "node:worker_threads";
import { expect, test } from "vitest";
import { portable } from "../helpers/worker-threads.js";

test("getEnvironmentData has Map key identity and returns the stored reference", () => {
  for (const api of [native, portable().workerThreads]) {
    const key = {};
    const value = { count: 1 };
    api.setEnvironmentData(key, value);
    expect(api.getEnvironmentData(key)).toBe(value);
    expect(api.getEnvironmentData({})).toBeUndefined();
    value.count = 2;
    expect(api.getEnvironmentData(key)).toEqual({ count: 2 });
    api.setEnvironmentData(key, undefined);
  }
});
