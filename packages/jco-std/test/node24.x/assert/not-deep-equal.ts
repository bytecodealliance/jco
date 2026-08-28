import { test } from "vitest";
import assert from "../../../src/node24.x/assert/index.js";
import { compareOutcome, describeDifferential, nodeAssert } from "../helpers/assert.js";

describeDifferential("assert.notDeepEqual", () => {
  test.each([
    [{ value: 1 }, { value: 2 }],
    [{ value: 1 }, { value: "1" }],
    [new Set([1, 2]), new Set([1, 3])],
    [new Map([[1, "a"]]), new Map([[1, "b"]])],
  ])("matches Node for structured values", (actual, expected) => {
    compareOutcome(
      () => assert.notDeepEqual(actual, expected),
      () => nodeAssert.notDeepEqual(actual, expected),
    );
  });
});
