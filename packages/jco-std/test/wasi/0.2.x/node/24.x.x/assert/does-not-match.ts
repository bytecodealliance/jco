import { test } from "vitest";
import assert from "../../../../../../src/wasi/0.2.x/node/24.x.x/assert/index.js";
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
