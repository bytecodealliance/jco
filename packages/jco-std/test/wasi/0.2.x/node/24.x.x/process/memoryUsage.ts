import nativeProcess from "node:process";
import { expect, test } from "vitest";
import { process, createProcess, denied } from "../helpers/process.js";
test("native memory and rss measurements have the correct units and fields", () => {
  expect(Object.keys(process.memoryUsage()).sort()).toEqual(
    Object.keys(nativeProcess.memoryUsage()).sort(),
  );
  for (const value of Object.values(process.memoryUsage())) {
    expect(value).toBeGreaterThanOrEqual(0);
  }
  expect(process.memoryUsage.rss()).toBeGreaterThan(0);
  expect(() => createProcess(denied).memoryUsage.rss()).toThrow(
    expect.objectContaining({ code: "ERR_JCO_PROCESS_ADAPTER_REQUIRED" }),
  );
});
