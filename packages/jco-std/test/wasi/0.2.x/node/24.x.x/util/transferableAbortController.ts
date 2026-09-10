import { expect } from "vitest";
import { util, test } from "../helpers/util.js";

test("transferableAbortController refuses unavailable behavior before observing inputs", () => {
  expect(() => Reflect.apply(util.transferableAbortController, undefined, [])).toThrow(
    expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
  );
});
