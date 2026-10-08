import { expect, test } from "vitest";
import util from "../../../../../../src/wasi/0.2.x/node/24.x.x/util/index.js";

test("getCallSites captures the caller and restores a custom stack formatter", () => {
  const error = Error as ErrorConstructor & { prepareStackTrace?: unknown };
  const previous = error.prepareStackTrace;
  const formatter = () => "custom stack";
  error.prepareStackTrace = formatter;
  try {
    function captureCaller() {
      return util.getCallSites(1);
    }
    const sites = captureCaller();
    expect(sites).toHaveLength(1);
    expect(sites[0]).toMatchObject({ functionName: "captureCaller" });
    expect(sites[0].scriptName).toContain("getCallSites.ts");
    expect(sites[0].lineNumber).toBeGreaterThan(0);
    expect(error.prepareStackTrace).toBe(formatter);
    expect(() => util.getCallSites(0)).toThrow(
      expect.objectContaining({ code: "ERR_OUT_OF_RANGE" }),
    );
  } finally {
    error.prepareStackTrace = previous;
  }
});
