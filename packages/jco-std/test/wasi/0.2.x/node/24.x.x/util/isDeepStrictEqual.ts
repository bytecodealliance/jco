import { expect } from "vitest";
import { util, native, test } from "../helpers/util.js";

test("isDeepStrictEqual shares assertion comparison semantics", () => {
  class A {
    x = 1;
  }

  class B {
    x = 1;
  }

  for (const [a, b] of [
    [new A(), new B()],
    [new Map([[1, { x: 2 }]]), new Map([[1, { x: 2 }]])],
    [NaN, NaN],
    [-0, 0],
    [{ x: [1] }, { x: [2] }],
  ]) {
    // The pinned runtime takes a boolean; installed Node types describe the later options object.
    for (const skip of [false, true]) {
      expect(util.isDeepStrictEqual(a, b, skip)).toBe(
        Reflect.apply(native.isDeepStrictEqual, undefined, [a, b, skip]),
      );
    }
  }
  const a: { self?: unknown } = {};
  a.self = a;
  const b: { self?: unknown } = {};
  b.self = b;
  expect(util.isDeepStrictEqual(a, b)).toBe(true);
});
