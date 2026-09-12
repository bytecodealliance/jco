import { expect, test } from "vitest";
import { v8, blocked, deniedError } from "../helpers/v8.js";

test("returns an actual CPU profile and stops only once", () => {
  const profile = v8.startCpuProfile();
  const result = JSON.parse(profile.stop()!);
  expect(result.nodes.length).toBeGreaterThan(0);
  expect(result.endTime).toBeGreaterThanOrEqual(result.startTime);
  expect(profile.stop()).toBeUndefined();
  profile[Symbol.dispose]();
  expect(() => blocked.startCpuProfile()).toThrow(expect.objectContaining(deniedError));
});
