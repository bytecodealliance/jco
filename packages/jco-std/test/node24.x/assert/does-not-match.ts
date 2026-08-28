import { test } from "vitest";
import assert from "../../../src/node24.x/assert/index.js";
import { compareOutcome, describeDifferential, nodeAssert } from "../helpers/assert.js";

describeDifferential("assert.doesNotMatch", () => {
  test.each([
    ["hello", /ell/],
    ["hello", /world/],
    ["HELLO", /hello/],
  ])("rejects matching and accepts non-matching input", (value, regexp) =>
    compareOutcome(
      () => assert.doesNotMatch(value, regexp),
      () => nodeAssert.doesNotMatch(value, regexp),
    ),
  );
});
