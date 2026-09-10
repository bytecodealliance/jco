import { expect } from "vitest";
import { util, native, test, capture } from "../helpers/util.js";

test("toUSVString replaces only lone surrogates and preserves coercion", () => {
  for (const value of [
    "abc",
    "🌍",
    "\ud800x\udc00",
    42,
    null,
    undefined,
    {
      toString() {
        return "x";
      },
    },
    Symbol("s"),
  ]) {
    expect(capture(() => util.toUSVString(value))).toEqual(
      capture(() => Reflect.apply(native.toUSVString, undefined, [value])),
    );
  }
});
