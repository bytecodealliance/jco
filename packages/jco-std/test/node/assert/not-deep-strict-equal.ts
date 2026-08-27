import { describe, test } from "vitest";
import assert from "../../../src/node/assert/index.js";
import { compareOutcome, nodeAssert } from "../helpers/assert.js";

describe("assert.notDeepStrictEqual", () => {
  test.each([
    [{ value: 1 }, { value: 1 }],
    [{ value: 1 }, { value: "1" }],
    [new Set([1, 2]), new Set([2, 1])],
    [new Uint8Array([1]), new Uint8Array([2])],
  ])("matches Node for strict inequality", (actual, expected) => {
    compareOutcome(
      () => assert.notDeepStrictEqual(actual, expected),
      () => nodeAssert.notDeepStrictEqual(actual, expected),
    );
  });
});
