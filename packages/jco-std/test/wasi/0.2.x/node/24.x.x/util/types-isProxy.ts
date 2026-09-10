import { expect } from "vitest";
import { util, test } from "../helpers/util.js";

test("types.isProxy refuses inaccessible native state without reflection", () => {
  const value = new Proxy(
    {},
    {
      get() {
        throw Error("getter");
      },

      getPrototypeOf() {
        throw Error("prototype");
      },
    },
  );
  expect(() => util.types.isProxy(value)).toThrow(
    expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
  );
});
