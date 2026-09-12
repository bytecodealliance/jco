import { test } from "vitest";
import { Module } from "../../../../../../src/wasi/0.2.x/node/24.x.x/vm.js";
import { expectUnsupported, poison } from "../helpers/vm.js";

test("Module construction, methods and accessors all refuse without touching arguments", () => {
  expectUnsupported(() => Reflect.construct(Module, [poison()]), "vm.Module");
  const receiver = Object.create(Module.prototype) as Module;

  expectUnsupported(() => Reflect.apply(receiver.link, receiver, [poison()]), "vm.Module.link");
  expectUnsupported(
    () => Reflect.apply(receiver.evaluate, receiver, [poison()]),
    "vm.Module.evaluate",
  );

  for (const key of ["identifier", "context", "namespace", "status", "error"] as const) {
    expectUnsupported(() => receiver[key], `vm.Module.${key}`);
  }
});
