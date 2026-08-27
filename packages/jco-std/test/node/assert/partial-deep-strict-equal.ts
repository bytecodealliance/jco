import { describe, test } from "vitest";
import assert from "../../../src/node/assert/index.js";
import { compareOutcome, nodeAssert } from "../helpers/assert.js";

describe("assert.partialDeepStrictEqual", () => {
  test.each([
    [{ a: 1, b: 2 }, { a: 1 }],
    [{ a: { b: 1, c: 2 } }, { a: { b: 1 } }],
    [
      [1, 2, 3, 4],
      [2, 4],
    ],
    [new Set([1, 2, 3]), new Set([3, 1])],
    [
      new Map([
        ["a", 1],
        ["b", 2],
      ]),
      new Map([["b", 2]]),
    ],
    [{ a: 1 }, { a: 2 }],
  ])("matches Node subset behavior", (actual, expected) => {
    compareOutcome(
      () => assert.partialDeepStrictEqual(actual, expected),
      () => nodeAssert.partialDeepStrictEqual(actual, expected),
    );
  });
});
