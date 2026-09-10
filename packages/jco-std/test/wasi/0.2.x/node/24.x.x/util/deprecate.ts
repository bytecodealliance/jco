import { expect } from "vitest";
import { util, test } from "../helpers/util.js";

test("deprecate refuses unavailable behavior before observing inputs", () => {
  expect(() =>
    Reflect.apply(util.deprecate, undefined, [
      () => {
        throw Error("called");
      },
      "old",
    ]),
  ).toThrow(expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }));
});
