import { expect, test } from "vitest";
import assert from "../../../../../../src/wasi/0.2.x/node/24.x.x/assert/index.js";
import {
  compareOutcome,
  describeDifferential,
  expectAssertion,
  nodeAssert,
} from "../helpers/assert.js";

describeDifferential("assert.strictEqual", () => {
  test.each([
    [1, 1],
    [Number.NaN, Number.NaN],
    [0, -0],
    [{}, {}],
  ])("uses Object.is semantics for %s and %s", (actual, expected) =>
    compareOutcome(
      () => assert.strictEqual(actual, expected),
      () => nodeAssert.strictEqual(actual, expected),
    ),
  );

  test.concurrent("sets stable failure fields", () => {
    expectAssertion(() => assert.strictEqual(1, 2), {
      actual: 1,
      expected: 2,
      operator: "strictEqual",
    });
  });

  test.concurrent("throws a supplied Error", () => {
    const error = new Error("custom");
    expect(() => assert.strictEqual(1, 2, error)).toThrow(error);
  });
});
