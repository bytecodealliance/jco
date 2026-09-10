import { expect } from "vitest";
import { util, test } from "../helpers/util.js";

test("debuglog refuses unavailable behavior before observing inputs", () => {
  expect(() =>
    Reflect.apply(util.debuglog, undefined, [
      "net",
      () => {
        throw Error("callback touched");
      },
    ]),
  ).toThrow(expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }));
});
