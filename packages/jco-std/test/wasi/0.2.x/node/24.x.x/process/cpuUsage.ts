import nativeProcess from "node:process";
import { expect, test } from "vitest";
import { process, createProcess, denied, errorOf } from "../helpers/process.js";
test("cpuUsage measurements, previous values and invalid fields", () => {
  const start = process.cpuUsage();
  expect(start.user).toBeGreaterThanOrEqual(0);
  expect(start.system).toBeGreaterThanOrEqual(0);
  const delta = process.cpuUsage(start);
  expect(delta.user).toBeGreaterThanOrEqual(0);
  expect(delta.system).toBeGreaterThanOrEqual(0);
  for (const bad of [
    { user: -1, system: 0 },
    { user: 0, system: NaN },
    { user: Infinity, system: 0 },
  ]) {
    expect(errorOf(() => process.cpuUsage(bad))).toEqual(
      errorOf(() => nativeProcess.cpuUsage(bad)),
    );
  }
  expect(() => createProcess(denied).cpuUsage()).toThrow(
    expect.objectContaining({ code: "ERR_JCO_PROCESS_ADAPTER_REQUIRED" }),
  );
});
