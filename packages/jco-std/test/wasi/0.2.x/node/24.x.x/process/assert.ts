import { expect, test } from "vitest";
import { process } from "../helpers/process.js";
test("deprecated assert fails before observing arguments", () => {
  const value = new Proxy(
    {},
    {
      get() {
        throw new Error("touched argument");
      },
    },
  );
  expect(() => process.assert(value)).toThrow(
    expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API" }),
  );
});
