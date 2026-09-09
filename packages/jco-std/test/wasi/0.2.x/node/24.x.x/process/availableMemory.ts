import { expect, test } from "vitest";
import { process, createProcess, denied } from "../helpers/process.js";
test("availableMemory returns native nonnegative values and denies missing capability", () => {
  const value = process.availableMemory();
  expect(Number.isFinite(value)).toBe(true);
  expect(value).toBeGreaterThanOrEqual(0);

  expect(() => createProcess(denied).availableMemory()).toThrow(
    expect.objectContaining({ code: "ERR_JCO_PROCESS_ADAPTER_REQUIRED" }),
  );
});
