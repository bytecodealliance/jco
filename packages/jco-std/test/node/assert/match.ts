import { describe, expect, test } from "vitest";
import assert from "../../../src/node/assert/index.js";
import { compareOutcome, nodeAssert } from "../helpers/assert.js";

describe("assert.match", () => {
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
