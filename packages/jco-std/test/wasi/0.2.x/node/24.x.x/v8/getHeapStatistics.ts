import { expect, test } from "vitest";
import native from "node:v8";
import { v8, blocked, deniedError } from "../helpers/v8.js";

test("returns native heap fields and meaningful sizes", () => {
  const stats = v8.getHeapStatistics();
  expect(Object.keys(stats)).toEqual(Object.keys(native.getHeapStatistics()));
  expect(stats.used_heap_size).toBeGreaterThan(0);
  expect(stats.heap_size_limit).toBe(native.getHeapStatistics().heap_size_limit);
  expect(() => blocked.getHeapStatistics()).toThrow(expect.objectContaining(deniedError));
});
