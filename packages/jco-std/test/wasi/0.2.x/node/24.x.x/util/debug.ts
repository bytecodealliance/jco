import { expect } from "vitest";
import { util, native, test } from "../helpers/util.js";

test("debug aliases debuglog and returns a disabled logger like Node", () => {
  expect(util.debug).toBe(util.debuglog);
  const section = "jco-std-disabled-debug-fixture";
  const logger = util.debug(section);
  expect(logger.enabled).toBe(native.debug(section).enabled);
  expect(logger("unused %s", "message")).toBeUndefined();
});
