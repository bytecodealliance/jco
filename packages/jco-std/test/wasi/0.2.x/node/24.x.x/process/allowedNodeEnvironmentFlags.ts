import nativeProcess from "node:process";
import { expect, test } from "vitest";
import { process } from "../helpers/process.js";
test("allowed flags preserve native normalization and immutability", () => {
  const flags = process.allowedNodeEnvironmentFlags;
  expect([...flags]).toEqual([...nativeProcess.allowedNodeEnvironmentFlags]);
  expect(flags.size).toBe(nativeProcess.allowedNodeEnvironmentFlags.size);
  for (const value of [
    "trace-warnings",
    "--trace-warnings",
    "--stack-trace-limit=10",
    "not-a-flag",
  ]) {
    expect(flags.has(value)).toBe(nativeProcess.allowedNodeEnvironmentFlags.has(value));
  }
  (flags as Set<string>).add("--jco-fake");
  expect(flags.has("--jco-fake")).toBe(false);
});
