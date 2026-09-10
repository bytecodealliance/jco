import { expect } from "vitest";
import { util, native, test } from "../helpers/util.js";

test("types.isBigInt64Array agrees with Node for brands and primitive negatives", () => {
  const positive: unknown[] = [new BigInt64Array(1)];
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
    expect(util.types.isBigInt64Array(value)).toBe(native.types.isBigInt64Array(value));
  }
});
