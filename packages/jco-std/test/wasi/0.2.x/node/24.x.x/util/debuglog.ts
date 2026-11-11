import { afterEach, expect, vi } from "vitest";
import { util, native, test } from "../helpers/util.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

test.each([false, true])(
  "debuglog initializes its callback lazily (read enabled: %s)",
  (readEnabled) => {
    function report(api: typeof util | typeof native) {
      let calls = 0;
      let callbackLogger: ((...args: unknown[]) => void) | undefined;
      const logger = api.debuglog("jco-std-disabled-debug-fixture", (fn) => {
        calls++;
        callbackLogger = fn;
      });
      expect(calls).toBe(0);
      if (readEnabled) {
        expect(logger.enabled).toBe(false);
      }
      logger("ignored");
      logger("also ignored");
      return {
        calls,
        enabled: logger.enabled,
        callbackEnabled: callbackLogger && Reflect.get(callbackLogger, "enabled"),
      };
    }
    expect(report(util)).toEqual(report(native));
  },
);

test("debuglog matches sections case-insensitively and formats enabled output", () => {
  vi.stubEnv("NODE_DEBUG", "other,JCO-STD-*");
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  const callback = vi.fn();
  const logger = util.debuglog("jco-std-fixture", callback);
  expect(logger.enabled).toBe(true);
  expect(callback).not.toHaveBeenCalled();
  logger("value=%d %s", 42, "ok");
  logger("again");
  expect(callback).toHaveBeenCalledTimes(1);
  expect(output.mock.calls).toEqual([
    [`JCO-STD-FIXTURE ${process.pid}: value=42 ok`],
    [`JCO-STD-FIXTURE ${process.pid}: again`],
  ]);
});
