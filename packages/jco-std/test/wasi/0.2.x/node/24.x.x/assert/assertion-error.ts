import { describe, expect, test } from "vitest";
import { AssertionError } from "../../../../../../src/wasi/0.2.x/node/24.x.x/assert/index.js";

describe("assert.AssertionError", () => {
  test.concurrent("exposes Node-compatible public fields", () => {
    const error = new AssertionError({ actual: 1, expected: 2, operator: "strictEqual" });
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      name: "AssertionError",
      code: "ERR_ASSERTION",
      actual: 1,
      expected: 2,
      operator: "strictEqual",
      generatedMessage: true,
      diff: "simple",
    });
    expect(error.toString()).toContain("AssertionError [ERR_ASSERTION]");
  });

  test.concurrent("preserves an explicit message and full diff option", () => {
    const error = new AssertionError({ message: "boom", diff: "full" });
    expect(error.message).toBe("boom");
    expect(error.generatedMessage).toBe(false);
    expect(error.diff).toBe("full");
  });

  test.concurrent("matches Node property descriptors and empty-message metadata", () => {
    const error = new AssertionError({ message: "" });
    expect(error.generatedMessage).toBe(true);
    expect(Object.keys(error)).toEqual([
      "generatedMessage",
      "code",
      "actual",
      "expected",
      "operator",
      "diff",
    ]);
    expect(Object.getOwnPropertyDescriptor(error, "name")?.enumerable).toBe(false);
    expect(error.stack?.split("\n", 1)[0]).toContain("AssertionError [ERR_ASSERTION]");
  });
});
