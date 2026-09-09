import { expect, test } from "vitest";
import { process } from "../helpers/process.js";
test("deprecated binding fails before observing arguments", () => {
  const value = new Proxy(
    {},
    {
      get() {
        throw new Error("touched argument");
      },
    },
  );
  expect(() => process.binding(value)).toThrow(
    expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API" }),
  );
});
