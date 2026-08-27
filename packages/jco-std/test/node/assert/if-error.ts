import { describe, expect, test } from "vitest";
import assert from "../../../src/node/assert/index.js";

describe("assert.ifError", () => {
  test.each([null, undefined])("accepts %s", (value) => {
    expect(() => assert.ifError(value)).not.toThrow();
  });

  test.each([0, false, "error", new Error("boom")])("rejects non-nullish value %s", (value) => {
    expect(() => assert.ifError(value)).toThrowError(
      expect.objectContaining({
        code: "ERR_ASSERTION",
        actual: value,
        expected: null,
        operator: "ifError",
      }),
    );
  });
});
