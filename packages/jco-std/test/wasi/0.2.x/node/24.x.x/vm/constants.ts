import { expect, test } from "vitest";
import native from "node:vm";
import { constants } from "../../../../../../src/wasi/0.2.x/node/24.x.x/vm.js";

test("constants are distinct symbols in a frozen null-prototype namespace", () => {
  expect(Object.getPrototypeOf(constants)).toBeNull();
  expect(Object.isFrozen(constants)).toBe(true);
  expect(Object.keys(constants)).toEqual(Object.keys(native.constants));

  for (const key of ["USE_MAIN_CONTEXT_DEFAULT_LOADER", "DONT_CONTEXTIFY"] as const) {
    expect(constants[key].description).toBe(native.constants[key].description);
    expect(Object.getOwnPropertyDescriptor(constants, key)).toMatchObject({
      writable: false,
      configurable: false,
      enumerable: true,
    });
  }

  expect(constants.DONT_CONTEXTIFY).not.toBe(constants.USE_MAIN_CONTEXT_DEFAULT_LOADER);
});
