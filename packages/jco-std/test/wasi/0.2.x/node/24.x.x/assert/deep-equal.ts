import { test } from "vitest";
import assert from "../../../../../../src/wasi/0.2.x/node/24.x.x/assert/index.js";
import { compareOutcome, describeDifferential, nodeAssert } from "../helpers/assert.js";

describeDifferential("assert.deepEqual", () => {
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

  test.concurrent("supports equivalent cycles", () => {
    const actual: { self?: unknown; value: number } = { value: 1 };
    const expected: { self?: unknown; value: string } = { value: "1" };
    actual.self = actual;
    expected.self = expected;
    compareOutcome(
      () => assert.deepEqual(actual, expected),
      () => nodeAssert.deepEqual(actual, expected),
    );
  });

  test.concurrent("uses numeric comparison for loose float arrays", () => {
    compareOutcome(
      () => assert.deepEqual(new Float32Array([0]), new Float32Array([-0])),
      () => nodeAssert.deepEqual(new Float32Array([0]), new Float32Array([-0])),
    );
  });
});
