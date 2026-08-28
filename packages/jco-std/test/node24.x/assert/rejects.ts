import { describe, expect, test } from "vitest";
import assert from "../../../src/node24.x/assert/index.js";

describe("assert.rejects", () => {
  test("accepts rejected promises and async functions", async () => {
    await expect(assert.rejects(Promise.reject(new Error("boom")))).resolves.toBeUndefined();
    await expect(
      assert.rejects(async () => {
        throw new TypeError("boom");
      }, TypeError),
    ).resolves.toBeUndefined();
    await expect(
      assert.rejects(async () => {
        throw new Error("boom");
      }, /boom/),
    ).resolves.toBeUndefined();
    await expect(
      assert.rejects(
        async () => {
          throw { code: "E_TEST" };
        },
        { code: "E_TEST" },
      ),
    ).resolves.toBeUndefined();
  });

  test("rejects fulfilled and invalid return values", async () => {
    await expect(assert.rejects(Promise.resolve(1))).rejects.toMatchObject({
      code: "ERR_ASSERTION",
    });
    await expect(Reflect.apply(assert.rejects, undefined, [() => 1])).rejects.toMatchObject({
      code: "ERR_INVALID_RETURN_VALUE",
    });
    await expect(
      Reflect.apply(assert.rejects, undefined, [
        {
          then: (_resolve: () => void, reject: (reason: Error) => void) =>
            reject(new Error("boom")),
        },
      ]),
    ).rejects.toMatchObject({ code: "ERR_INVALID_ARG_TYPE" });
  });

  test("preserves synchronous throws from the promise function", async () => {
    const error = new Error("sync");
    await expect(
      assert.rejects(() => {
        throw error;
      }),
    ).rejects.toBe(error);
  });
});
