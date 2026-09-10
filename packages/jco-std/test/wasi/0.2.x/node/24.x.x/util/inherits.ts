import { expect } from "vitest";
import { util, native, test, capture } from "../helpers/util.js";

test("inherits preserves parent prototypes and static super_ descriptor", () => {
  function Parent() {}

  function Child() {}

  util.inherits(Child, Parent);
  expect(Object.getPrototypeOf(Child.prototype)).toBe(Parent.prototype);
  expect(Object.getOwnPropertyDescriptor(Child, "super_")).toEqual({
    value: Parent,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  for (const args of [
    [null, Parent],
    [Child, null],
    [Child, () => {}],
  ]) {
    expect(capture(() => Reflect.apply(util.inherits, undefined, args))).toEqual(
      capture(() => Reflect.apply(native.inherits, undefined, args)),
    );
  }
});
