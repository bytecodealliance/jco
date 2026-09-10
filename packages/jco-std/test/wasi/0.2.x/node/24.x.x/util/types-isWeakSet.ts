import { expect } from "vitest";
import { util, native, test } from "../helpers/util.js";

test("types.isWeakSet agrees with Node for brands and primitive negatives", () => {
  const positive: unknown[] = [new WeakSet()];
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
    expect(util.types.isWeakSet(value)).toBe(native.types.isWeakSet(value));
  }
});
