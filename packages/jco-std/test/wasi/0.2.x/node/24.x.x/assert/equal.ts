import { expect, test } from "vitest";
import assert from "../../../../../../src/wasi/0.2.x/node/24.x.x/assert/index.js";
import { compareOutcome, describeDifferential, nodeAssert } from "../helpers/assert.js";

describeDifferential("assert.equal", () => {
  test.each([
    [1, 1],
    [1, "1"],
    [false, 0],
    [null, undefined],
    [Number.NaN, Number.NaN],
  ])("compares %s and %s using Node legacy equality", (actual, expected) =>
    compareOutcome(
      () => assert.equal(actual, expected),
      () => nodeAssert.equal(actual, expected),
    ),
  );

  test.concurrent("requires both operands", () => {
    compareOutcome(
      () => Reflect.apply(assert.equal, undefined, [1]),
      () => Reflect.apply(nodeAssert.equal, undefined, [1]),
    );
    try {
      Reflect.apply(assert.equal, undefined, [1]);
    } catch (error) {
      expect(error).toMatchObject({ name: "TypeError", code: "ERR_MISSING_ARGS" });
      expect(String(error)).toContain("TypeError [ERR_MISSING_ARGS]");
      expect((error as Error).stack?.split("\n", 1)[0]).toContain("TypeError [ERR_MISSING_ARGS]");
      return;
    }
    throw new Error("Expected assert.equal to reject a missing operand");
  });
});
