import { describe, test } from "vitest";
import assert from "../../../src/node/assert/index.js";
import { compareOutcome, nodeAssert } from "../helpers/assert.js";

describe("assert.doesNotMatch", () => {
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
