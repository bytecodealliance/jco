import { expect } from "vitest";
import { util, native, test } from "../helpers/util.js";

test("types.isFloat16Array agrees with Node for brands and primitive negatives", () => {
  const positive: unknown[] = [new Float16Array(1)];
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
    expect(util.types.isFloat16Array(value)).toBe(native.types.isFloat16Array(value));
  }
});
