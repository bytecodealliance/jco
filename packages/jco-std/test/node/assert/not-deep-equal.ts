import { describe, test } from "vitest";
import assert from "../../../src/node/assert/index.js";
import { compareOutcome, nodeAssert } from "../helpers/assert.js";

describe("assert.notDeepEqual", () => {
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
