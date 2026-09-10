import { runInNewContext } from "node:vm";
import { expect } from "vitest";
import { util, native, test } from "../helpers/util.js";

test("types.isArgumentsObject agrees with Node for brands and primitive negatives", () => {
  const positive: unknown[] = [runInNewContext("(function () { return arguments; })(1, 2)")];
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
    expect(util.types.isArgumentsObject(value)).toBe(native.types.isArgumentsObject(value));
  }
});
