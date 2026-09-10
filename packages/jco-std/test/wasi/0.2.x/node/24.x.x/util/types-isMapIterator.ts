import { expect } from "vitest";
import { util, native, test } from "../helpers/util.js";

test("types.isMapIterator agrees with Node for brands and primitive negatives", () => {
  const positive: unknown[] = [new Map().entries(), new Map().keys()];
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
    expect(util.types.isMapIterator(value)).toBe(native.types.isMapIterator(value));
  }
});
