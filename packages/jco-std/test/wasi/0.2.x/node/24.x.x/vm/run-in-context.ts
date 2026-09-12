import { test } from "vitest";
import { runInContext } from "../../../../../../src/wasi/0.2.x/node/24.x.x/vm.js";
import { expectUnsupported, poison } from "../helpers/vm.js";

test("runInContext refuses before source coercion, context inspection or option getters", () => {
  expectUnsupported(
    () => Reflect.apply(runInContext, undefined, [poison(), poison(), poison()]),
    "vm.runInContext",
  );
});
