import { expect, test } from "vitest";
import native from "node:v8";
import { v8, blocked, deniedError, unsupportedError } from "../helpers/v8.js";

const hasCpuProfile = typeof native.startCpuProfile === "function";

test.runIf(hasCpuProfile)("returns an actual CPU profile and stops only once", () => {
  const profile = v8.startCpuProfile();
  const result = JSON.parse(profile.stop()!);
  expect(result.nodes.length).toBeGreaterThan(0);
  expect(result.endTime).toBeGreaterThanOrEqual(result.startTime);
  expect(profile.stop()).toBeUndefined();
  profile[Symbol.dispose]();
});

test.runIf(!hasCpuProfile)(
  "reports an unsupported API when the Node host lacks CPU profiling",
  () => {
    expect(() => v8.startCpuProfile()).toThrow(
      expect.objectContaining({
        ...unsupportedError,
        message: expect.stringContaining("v8.startCpuProfile()"),
      }),
    );
  },
);

test("denies CPU profiling without an explicit provider on every host version", () => {
  expect(() => blocked.startCpuProfile()).toThrow(expect.objectContaining(deniedError));
});
