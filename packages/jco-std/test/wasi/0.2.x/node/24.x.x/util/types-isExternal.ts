import { expect } from "vitest";
import { util, test } from "../helpers/util.js";

test("types.isExternal refuses inaccessible native state without reflection", () => {
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
  expect(() => util.types.isExternal(value)).toThrow(
    expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
  );
});
