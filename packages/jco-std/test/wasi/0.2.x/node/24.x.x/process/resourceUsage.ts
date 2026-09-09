import nativeProcess from "node:process";
import { expect, test } from "vitest";
import { process } from "../helpers/process.js";
test("resourceUsage preserves Node acronym names across WIT", () => {
  const usage = process.resourceUsage();
  expect(Object.keys(usage).sort()).toEqual(Object.keys(nativeProcess.resourceUsage()).sort());
  expect(usage.maxRSS).toBeGreaterThan(0);
  for (const value of Object.values(usage)) {
    expect(value).toBeGreaterThanOrEqual(0);
  }
});
