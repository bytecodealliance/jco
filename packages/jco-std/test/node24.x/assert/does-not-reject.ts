import { describe, expect, test } from "vitest";
import assert from "../../../src/node24.x/assert/index.js";

describe("assert.doesNotReject", () => {
  test("accepts fulfilled promises", async () => {
    await expect(assert.doesNotReject(Promise.resolve(1))).resolves.toBeUndefined();
    await expect(assert.doesNotReject(async () => 1)).resolves.toBeUndefined();
  });

  test("rejects matching failures and rethrows non-matches", async () => {
    await expect(
      assert.doesNotReject(Promise.reject(new TypeError("boom")), TypeError),
    ).rejects.toMatchObject({
      code: "ERR_ASSERTION",
    });
    const error = new TypeError("boom");
    await expect(assert.doesNotReject(Promise.reject(error), SyntaxError)).rejects.toBe(error);
  });

  test("validates returned promises", async () => {
    await expect(Reflect.apply(assert.doesNotReject, undefined, [() => 1])).rejects.toMatchObject({
      code: "ERR_INVALID_RETURN_VALUE",
    });
  });

  test("rejects non-Promise thenables", async () => {
    await expect(
      Reflect.apply(assert.doesNotReject, undefined, [
        { then: (resolve: () => void) => resolve() },
      ]),
    ).rejects.toMatchObject({ code: "ERR_INVALID_ARG_TYPE" });
  });
});
