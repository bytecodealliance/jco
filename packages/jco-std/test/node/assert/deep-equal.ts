import { describe, test } from "vitest";
import assert from "../../../src/node/assert/index.js";
import { compareOutcome, nodeAssert } from "../helpers/assert.js";

describe("assert.deepEqual", () => {
  test.each([
    [{ nested: { value: 1 } }, { nested: { value: "1" } }],
    [
      [1, , 3],
      [1, , 3],
    ],
    [new Date(0), new Date(0)],
    [/value/gi, /value/gi],
    [new Set([1, "2"]), new Set(["1", 2])],
    [new Map([[1, { value: "2" }]]), new Map([["1", { value: 2 }]])],
  ])("matches Node for structured values", (actual, expected) => {
    compareOutcome(
      () => assert.deepEqual(actual, expected),
      () => nodeAssert.deepEqual(actual, expected),
    );
  });

  test("supports equivalent cycles", () => {
    const actual: { self?: unknown; value: number } = { value: 1 };
    const expected: { self?: unknown; value: string } = { value: "1" };
    actual.self = actual;
    expected.self = expected;
    compareOutcome(
      () => assert.deepEqual(actual, expected),
      () => nodeAssert.deepEqual(actual, expected),
    );
  });

  test("uses numeric comparison for loose float arrays", () => {
    compareOutcome(
      () => assert.deepEqual(new Float32Array([0]), new Float32Array([-0])),
      () => nodeAssert.deepEqual(new Float32Array([0]), new Float32Array([-0])),
    );
  });
});
