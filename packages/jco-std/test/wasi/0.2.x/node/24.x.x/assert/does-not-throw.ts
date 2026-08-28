import { test } from "vitest";
import assert from "../../../../../../src/wasi/0.2.x/node/24.x.x/assert/index.js";
import { compareOutcome, describeDifferential, nodeAssert } from "../helpers/assert.js";

describeDifferential("assert.doesNotThrow", () => {
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
