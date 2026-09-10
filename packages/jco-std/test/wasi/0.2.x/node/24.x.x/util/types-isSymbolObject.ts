import { expect } from "vitest";
import { util, native, test } from "../helpers/util.js";

test("types.isSymbolObject agrees with Node for brands and primitive negatives", () => {
  const positive: unknown[] = [Object(Symbol("x"))];
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
    expect(util.types.isSymbolObject(value)).toBe(native.types.isSymbolObject(value));
  }
});
