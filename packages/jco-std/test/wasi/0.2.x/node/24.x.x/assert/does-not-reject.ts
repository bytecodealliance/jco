import { describe, expect, test } from "vitest";
import assert from "../../../../../../src/wasi/0.2.x/node/24.x.x/assert/index.js";

describe("assert.doesNotReject", () => {
  test.concurrent("accepts fulfilled promises", async () => {
    await expect(assert.doesNotReject(Promise.resolve(1))).resolves.toBeUndefined();
    await expect(assert.doesNotReject(async () => 1)).resolves.toBeUndefined();
  });

  test.concurrent("rejects matching failures and rethrows non-matches", async () => {
    await expect(
      assert.doesNotReject(Promise.reject(new TypeError("boom")), TypeError),
    ).rejects.toMatchObject({
      code: "ERR_ASSERTION",
    });
    const error = new TypeError("boom");
    await expect(assert.doesNotReject(Promise.reject(error), SyntaxError)).rejects.toBe(error);
  });

  test.concurrent("validates returned promises", async () => {
    await expect(Reflect.apply(assert.doesNotReject, undefined, [() => 1])).rejects.toMatchObject({
      code: "ERR_INVALID_RETURN_VALUE",
    });
  });

  test.concurrent("rejects non-Promise thenables", async () => {
    await expect(
      Reflect.apply(assert.doesNotReject, undefined, [
        { then: (resolve: () => void) => resolve() },
      ]),
    ).rejects.toMatchObject({ code: "ERR_INVALID_ARG_TYPE" });
  });
});
