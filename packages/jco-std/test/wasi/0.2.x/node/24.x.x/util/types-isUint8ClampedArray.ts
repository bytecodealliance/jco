import { expect } from "vitest";
import { util, native, test } from "../helpers/util.js";

test("types.isUint8ClampedArray agrees with Node for brands and primitive negatives", () => {
  const positive: unknown[] = [new Uint8ClampedArray(1)];
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
    expect(util.types.isUint8ClampedArray(value)).toBe(native.types.isUint8ClampedArray(value));
  }
});
