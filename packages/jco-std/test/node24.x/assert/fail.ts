import { describe, expect, test } from "vitest";
import assert from "../../../src/node24.x/assert/index.js";

describe("assert.fail", () => {
  test("supports the current zero and one argument forms", () => {
    expect(() => assert.fail()).toThrowError(
      expect.objectContaining({ code: "ERR_ASSERTION", message: "Failed" }),
    );
    expect(() => assert.fail("boom")).toThrowError(
      expect.objectContaining({ code: "ERR_ASSERTION", message: "boom" }),
    );
    const error = new TypeError("custom");
    expect(() => assert.fail(error)).toThrow(error);
  });

  test("stubs the deprecated multi-argument form immediately", () => {
    expect(() => Reflect.apply(assert.fail, undefined, [1, 2])).toThrowError(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API" }),
    );
  });

  test("does not inspect deprecated-form arguments", () => {
    let accessed = false;
    const value = Object.defineProperty({}, "property", { get: () => (accessed = true) });
    expect(() => Reflect.apply(assert.fail, undefined, [value, value])).toThrow();
    expect(accessed).toBe(false);
  });
});
