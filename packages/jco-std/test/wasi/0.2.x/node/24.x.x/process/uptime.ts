import nativeProcess from "node:process";
import { expect, test } from "vitest";
import { process, createProcess, denied } from "../helpers/process.js";
test("uptime returns native nonnegative values and denies missing capability", () => {
  const value = process.uptime();
  expect(Number.isFinite(value)).toBe(true);
  expect(value).toBeGreaterThanOrEqual(0);
  expect(Math.abs(value - nativeProcess.uptime())).toBeLessThan(1);
  expect(() => createProcess(denied).uptime()).toThrow(
    expect.objectContaining({ code: "ERR_JCO_PROCESS_ADAPTER_REQUIRED" }),
  );
});
