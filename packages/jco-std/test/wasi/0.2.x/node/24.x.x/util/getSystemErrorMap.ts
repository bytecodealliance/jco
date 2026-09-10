import { expect } from "vitest";
import { util, test } from "../helpers/util.js";

test("getSystemErrorMap refuses unavailable behavior before observing inputs", () => {
  expect(() => Reflect.apply(util.getSystemErrorMap, undefined, [])).toThrow(
    expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
  );
});
