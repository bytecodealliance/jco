import { test } from "vitest";
import assert from "../../../src/node24.x/assert/index.js";
import { compareOutcome, describeDifferential, nodeAssert } from "../helpers/assert.js";

describeDifferential("assert.notStrictEqual", () => {
  test.each([
    [1, 2],
    [1, "1"],
    [Number.NaN, Number.NaN],
    [0, -0],
  ])("uses negated Object.is semantics for %s and %s", (actual, expected) =>
    compareOutcome(
      () => assert.notStrictEqual(actual, expected),
      () => nodeAssert.notStrictEqual(actual, expected),
    ),
  );
});
