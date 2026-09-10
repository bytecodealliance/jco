import { expect } from "vitest";
import { util, native, test } from "../helpers/util.js";

test("types.isDataView agrees with Node for brands and primitive negatives", () => {
  const positive: unknown[] = [new DataView(new ArrayBuffer(1))];
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
    expect(util.types.isDataView(value)).toBe(native.types.isDataView(value));
  }
});
