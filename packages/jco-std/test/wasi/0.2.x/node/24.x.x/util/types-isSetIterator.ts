import { expect } from "vitest";
import { util, native, test } from "../helpers/util.js";

test("types.isSetIterator agrees with Node for brands and primitive negatives", () => {
  const positive: unknown[] = [new Set().values(), new Set().entries()];
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
    expect(util.types.isSetIterator(value)).toBe(native.types.isSetIterator(value));
  }
});
