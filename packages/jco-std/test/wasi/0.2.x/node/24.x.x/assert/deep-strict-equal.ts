import { test } from "vitest";
import assert from "../../../../../../src/wasi/0.2.x/node/24.x.x/assert/index.js";
import { compareOutcome, describeDifferential, nodeAssert } from "../helpers/assert.js";

describeDifferential("assert.deepStrictEqual", () => {
  test.each([
    [{ nested: { value: 1 } }, { nested: { value: 1 } }],
    [{ value: 1 }, { value: "1" }],
    [
      [1, , 3],
      [1, undefined, 3],
    ],
    [new Date(Number.NaN), new Date(Number.NaN)],
    [Object.assign(/value/gi, { lastIndex: 2 }), Object.assign(/value/gi, { lastIndex: 2 })],
    [new Uint16Array([1, 2]), new Uint16Array([1, 2])],
    [new Uint16Array([1, 2]), new Uint8Array([1, 2])],
    [new Set([{ value: 1 }, { value: 2 }]), new Set([{ value: 2 }, { value: 1 }])],
    [new Map([[{ key: 1 }, { value: 2 }]]), new Map([[{ key: 1 }, { value: 2 }]])],
    [new Error("boom", { cause: { code: 1 } }), new Error("boom", { cause: { code: 1 } })],
    [Promise.resolve(1), Promise.resolve(1)],
  ])("matches Node across built-in object families", (actual, expected) => {
    compareOutcome(
      () => assert.deepStrictEqual(actual, expected),
      () => nodeAssert.deepStrictEqual(actual, expected),
    );
  });

  test("compares enumerable symbols", () => {
    const key = Symbol("key");
    compareOutcome(
      () => assert.deepStrictEqual({ [key]: 1 }, { [key]: 2 }),
      () => nodeAssert.deepStrictEqual({ [key]: 1 }, { [key]: 2 }),
    );
  });

  test("compares array symbols and shared array buffers", () => {
    const symbol = Symbol("metadata");
    const left = [1];
    const right = [1];
    left[symbol] = { value: 1 };
    right[symbol] = { value: 2 };
    compareOutcome(
      () => assert.deepStrictEqual(left, right),
      () => nodeAssert.deepStrictEqual(left, right),
    );

    if (typeof SharedArrayBuffer !== "undefined") {
      const first = new SharedArrayBuffer(2);
      const second = new SharedArrayBuffer(2);
      new Uint8Array(first).set([1, 2]);
      new Uint8Array(second).set([1, 3]);
      compareOutcome(
        () => assert.deepStrictEqual(first, second),
        () => nodeAssert.deepStrictEqual(first, second),
      );
    }
  });

  test("preserves graph topology for cycles", () => {
    const actual: { child?: unknown } = {};
    const expected: { child?: unknown } = {};
    actual.child = actual;
    expected.child = expected;
    compareOutcome(
      () => assert.deepStrictEqual(actual, expected),
      () => nodeAssert.deepStrictEqual(actual, expected),
    );
  });
});
