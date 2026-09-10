import { expect } from "vitest";
import { util, native, test } from "../helpers/util.js";

test("types.isAnyArrayBuffer agrees with Node for brands and primitive negatives", () => {
  const positive: unknown[] = [new ArrayBuffer(1), new SharedArrayBuffer(1)];
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
    expect(util.types.isAnyArrayBuffer(value)).toBe(native.types.isAnyArrayBuffer(value));
  }
});
