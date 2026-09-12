import { expect, test } from "vitest";
import { v8, blocked, deniedError } from "../helpers/v8.js";

test("starts lazily, stops idempotently, and produces native profile data", () => {
  const profiler = new v8.GCProfiler();
  expect(profiler.stop()).toBeUndefined();
  profiler.start();
  profiler.start();
  const result = profiler.stop();
  expect(result).toMatchObject({ version: 1, statistics: expect.any(Array) });
  expect(result!.endTime).toBeGreaterThanOrEqual(result!.startTime);
  expect(profiler.stop()).toBeUndefined();
  profiler.start();
  profiler[Symbol.dispose]();
  const denied = new blocked.GCProfiler();
  expect(() => denied.start()).toThrow(expect.objectContaining(deniedError));
  expect(denied.stop()).toBeUndefined();
});
