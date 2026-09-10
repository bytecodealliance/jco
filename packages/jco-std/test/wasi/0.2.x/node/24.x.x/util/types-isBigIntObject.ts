import { expect } from "vitest";
import { util, native, test } from "../helpers/util.js";

test("types.isBigIntObject agrees with Node for brands and primitive negatives", () => {
  const positive: unknown[] = [Object(1n)];
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
    expect(util.types.isBigIntObject(value)).toBe(native.types.isBigIntObject(value));
  }
});
