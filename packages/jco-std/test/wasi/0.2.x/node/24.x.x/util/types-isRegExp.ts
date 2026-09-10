import { expect } from "vitest";
import { util, native, test } from "../helpers/util.js";

test("types.isRegExp agrees with Node for brands and primitive negatives", () => {
  const positive: unknown[] = [/x/g];
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
    expect(util.types.isRegExp(value)).toBe(native.types.isRegExp(value));
  }
});
