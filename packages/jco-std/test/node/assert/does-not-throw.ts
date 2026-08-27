import { describe, test } from "vitest";
import assert from "../../../src/node/assert/index.js";
import { compareOutcome, nodeAssert } from "../helpers/assert.js";

describe("assert.doesNotThrow", () => {
  test("accepts normal completion", () => {
    compareOutcome(
      () => assert.doesNotThrow(() => 1),
      () => nodeAssert.doesNotThrow(() => 1),
    );
  });

  test("rejects matched errors and rethrows unmatched errors", () => {
    compareOutcome(
      () =>
        assert.doesNotThrow(() => {
          throw new TypeError("boom");
        }, TypeError),
      () =>
        nodeAssert.doesNotThrow(() => {
          throw new TypeError("boom");
        }, TypeError),
    );
    compareOutcome(
      () =>
        assert.doesNotThrow(() => {
          throw new TypeError("boom");
        }, SyntaxError),
      () =>
        nodeAssert.doesNotThrow(() => {
          throw new TypeError("boom");
        }, SyntaxError),
    );
  });
});
