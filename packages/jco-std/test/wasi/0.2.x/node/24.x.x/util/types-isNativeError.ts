import { expect } from "vitest";
import { util, native, test } from "../helpers/util.js";

test("types.isNativeError agrees with Node for brands and primitive negatives", () => {
  const positive: unknown[] = [new Error("x"), new TypeError("x")];
  for (const value of [
    ...positive,
    null,
    undefined,
    0,
    false,
    "x",
    1n,
    Symbol(),
    {},
    [],
    () => {},
  ]) {
    expect(util.types.isNativeError(value)).toBe(native.types.isNativeError(value));
  }
});
