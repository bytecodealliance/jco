import { expect } from "vitest";
import { util, native, test } from "../helpers/util.js";

test("types.isAsyncFunction agrees with Node for brands and primitive negatives", () => {
  const positive: unknown[] = [async function f() {}];
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
    expect(util.types.isAsyncFunction(value)).toBe(native.types.isAsyncFunction(value));
  }
});

test("isAsyncFunction recognizes async generators", () => {
  const value = async function* (): AsyncGenerator<number> {
    yield 1;
  };

  expect(util.types.isAsyncFunction(value)).toBe(native.types.isAsyncFunction(value));
});
