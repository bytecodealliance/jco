import { expect, test } from "vitest";
import assert from "../../../../../../src/wasi/0.2.x/node/24.x.x/assert/index.js";
import { compareOutcome, describeDifferential, nodeAssert } from "../helpers/assert.js";

describeDifferential("assert.match", () => {
  test.each([
    ["hello", /ell/],
    ["hello", /world/],
    ["HELLO", /hello/i],
  ])("matches %s against %s", (value, regexp) =>
    compareOutcome(
      () => assert.match(value, regexp),
      () => nodeAssert.match(value, regexp),
    ),
  );

  test("validates the regexp and forwards Error messages", () => {
    expect(() => Reflect.apply(assert.match, undefined, ["value", "value"])).toThrowError(
      expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
    );
    const error = new Error("custom");
    expect(() => assert.match("value", /other/, error)).toThrow(error);
  });
});
