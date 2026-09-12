import { test } from "vitest";
import { measureMemory } from "../../../../../../src/wasi/0.2.x/node/24.x.x/vm.js";
import { expectUnsupported, poison } from "../helpers/vm.js";

test("measureMemory fails immediately rather than reporting a made-up heap size", () => {
  expectUnsupported(() => measureMemory(), "vm.measureMemory");
  expectUnsupported(() => Reflect.apply(measureMemory, undefined, [poison()]), "vm.measureMemory");
});
