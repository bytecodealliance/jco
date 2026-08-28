import { test } from "vitest";
import assert from "../../../src/node24.x/assert/index.js";
import { compareOutcome, describeDifferential, nodeAssert } from "../helpers/assert.js";

describeDifferential("assert.notEqual", () => {
  test.each([
    [1, 2],
    [1, "1"],
    [false, 0],
    [Number.NaN, Number.NaN],
  ])("compares %s and %s using Node legacy inequality", (actual, expected) =>
    compareOutcome(
      () => assert.notEqual(actual, expected),
      () => nodeAssert.notEqual(actual, expected),
    ),
  );
});
