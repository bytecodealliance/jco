import { expect, test } from "vitest";
import { process } from "../helpers/process.js";
test("hasUncaughtExceptionCaptureCallback fails immediately without inspecting arguments", () => {
  const value = new Proxy(
    {},
    {
      get() {
        throw new Error("touched argument");
      },
    },
  );
  expect(() =>
    Reflect.apply(process.hasUncaughtExceptionCaptureCallback, null, [value, value]),
  ).toThrow(
    expect.objectContaining({
      code: "ERR_JCO_UNSUPPORTED_NODE_API",
      message: expect.stringContaining("process.hasUncaughtExceptionCaptureCallback"),
    }),
  );
});
