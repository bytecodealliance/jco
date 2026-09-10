import { expect } from "vitest";
import { util, test } from "../helpers/util.js";

test("transferableAbortSignal refuses unavailable behavior before observing inputs", () => {
  const trap = new Proxy(
    {},
    {
      get() {
        throw Error("input touched");
      },

      ownKeys() {
        throw Error("input enumerated");
      },
    },
  );
  expect(() => Reflect.apply(util.transferableAbortSignal, undefined, [trap])).toThrow(
    expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
  );
});
