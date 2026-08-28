import { describe, expect, test } from "vitest";
import { Assert, AssertionError } from "../../../src/node24.x/assert/index.js";

describe("assert.Assert", () => {
  test("defaults legacy-named methods to strict behavior", () => {
    const instance = new Assert();
    expect(instance.equal).toBe(instance.strictEqual);
    expect(instance.deepEqual).toBe(instance.deepStrictEqual);
    expect(() => instance.equal(1, "1")).toThrow(AssertionError);
  });

  test("supports non-strict instances", () => {
    const instance = new Assert({ strict: false });
    expect(() => instance.equal(1, "1")).not.toThrow();
  });

  test("supports skipPrototype and validates diff", () => {
    class Left {
      value = 1;
    }
    class Right {
      value = 1;
    }
    expect(() => new Assert().deepStrictEqual(new Left(), new Right())).toThrow();
    expect(() =>
      new Assert({ skipPrototype: true }).deepStrictEqual(new Left(), new Right()),
    ).not.toThrow();
    expect(() => new Assert({ diff: "invalid" as "simple" })).toThrowError(/options\.diff/);
  });

  test("requires construction with new", () => {
    expect(() => Reflect.apply(Assert, undefined, [])).toThrowError(
      expect.objectContaining({ code: "ERR_CONSTRUCT_CALL_REQUIRED" }),
    );
  });
});
