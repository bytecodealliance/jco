import { expect } from "vitest";
import { util, test } from "../helpers/util.js";

test("promisify preserves this, custom hooks and callback results", async () => {
  const original = function (
    this: { base: number },
    value: number,
    callback: (error: unknown, result?: number) => void,
  ): void {
    callback(null, this.base + value);
  };

  const wrapped = util.promisify(original);
  expect(await wrapped.call({ base: 2 }, 3)).toBe(5);
  expect(wrapped.name).toBe(original.name);
  expect(wrapped.length).toBe(original.length);

  const custom = async () => 7;

  const fn = Object.assign(() => {}, { [util.promisify.custom]: custom });
  expect(util.promisify(fn)).toBe(custom);
  expect(util.promisify(custom)).toBe(custom);
  expect(() => util.promisify(async () => 1)).toThrow(
    expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API" }),
  );
  await expect(
    util.promisify((cb: (error: unknown) => void) => cb(new Error("oops")))(),
  ).rejects.toThrow("oops");
});
