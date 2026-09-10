import { expect, test } from "vitest";
import { harness } from "../helpers/test.js";
import type { TestContext } from "../../../../../../src/wasi/0.2.x/node/24.x.x/test/context.js";
test("context assertions reuse jco-std assertions and registered methods receive context", async () => {
  const h = harness();
  let received: unknown;
  h.test.assert.register("custom", function (this: TestContext, value: number): void {
    received = [this.name, value];
  });
  await h.test("assertions", (t: TestContext): void => {
    t.assert.deepStrictEqual({ a: [1] }, { a: [1] });
    t.assert.partialDeepStrictEqual({ a: 1, b: 2 }, { a: 1 });
    t.assert.throws((): never => {
      throw new Error("expected");
    }, /expected/);
    Reflect.apply(Reflect.get(t.assert, "custom"), t.assert, [42]);
  });
  await h.drain();
  expect(received).toEqual(["assertions", 42]);
  expect(h.results()[0].details.error).toBeUndefined();
});
