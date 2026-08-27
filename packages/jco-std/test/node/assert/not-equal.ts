import { describe, test } from "vitest";
import assert from "../../../src/node/assert/index.js";
import { compareOutcome, nodeAssert } from "../helpers/assert.js";

describe("assert.notEqual", () => {
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
