import { expect, test } from "vitest";
import native from "node:v8";
import { v8, blocked, deniedError } from "../helpers/v8.js";

test("returns native code statistics including profiler metadata", () => {
  const stats = v8.getHeapCodeStatistics();
  expect(Object.keys(stats)).toEqual(Object.keys(native.getHeapCodeStatistics()));
  expect(stats.code_and_metadata_size).toBeGreaterThan(0);
  expect(stats.bytecode_and_metadata_size).toBeGreaterThan(0);
  expect(() => blocked.getHeapCodeStatistics()).toThrow(expect.objectContaining(deniedError));
});
