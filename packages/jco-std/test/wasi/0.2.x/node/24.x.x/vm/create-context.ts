import { test } from "vitest";
import { constants, createContext } from "../../../../../../src/wasi/0.2.x/node/24.x.x/vm.js";
import { expectUnsupported, poison } from "../helpers/vm.js";

test("createContext never returns a fake context or reads its options", () => {
  for (const args of [[], [{ answer: 42 }], [constants.DONT_CONTEXTIFY], [poison(), poison()]]) {
    expectUnsupported(() => Reflect.apply(createContext, undefined, args), "vm.createContext");
  }
});
