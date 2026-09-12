import { expect, test } from "vitest";
import native from "node:vm";
import * as namespace from "../../../../../../src/wasi/0.2.x/node/24.x.x/vm.js";
import vm from "../../../../../../src/wasi/0.2.x/node/24.x.x/vm.js";

test("default and named exports share the complete Node 24 experimental module surface", () => {
  const names = [
    "Script",
    "createContext",
    "createScript",
    "runInContext",
    "runInNewContext",
    "runInThisContext",
    "isContext",
    "compileFunction",
    "measureMemory",
    "constants",
    "Module",
    "SourceTextModule",
    "SyntheticModule",
  ].sort();
  expect(Object.keys(vm).sort()).toEqual(names);
  expect(Object.keys(namespace).sort()).toEqual([...names, "default"].sort());

  for (const name of Object.keys(vm) as (keyof typeof vm)[]) {
    expect(namespace[name]).toBe(vm[name]);
    expect(Object.getOwnPropertyDescriptor(vm, name)).toMatchObject({
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }

  expect(Object.getPrototypeOf(vm.SourceTextModule)).toBe(vm.Module);
  expect(Object.getPrototypeOf(vm.SyntheticModule.prototype)).toBe(vm.Module.prototype);
  expect(vm.createScript).not.toBe(vm.Script);

  for (const name of [
    "Script",
    "createContext",
    "createScript",
    "runInContext",
    "runInNewContext",
    "runInThisContext",
    "isContext",
    "compileFunction",
    "measureMemory",
  ] as const) {
    expect(vm[name].name).toBe(native[name].name);
    expect(vm[name].length, name).toBe(native[name].length);
  }

  // Captured from the pinned runtime with --experimental-vm-modules enabled.
  expect([vm.Module.length, vm.SourceTextModule.length, vm.SyntheticModule.length]).toEqual([
    1, 1, 2,
  ]);
  expect(vm.Module.prototype.evaluate.length).toBe(0);
  expect(vm.SyntheticModule.prototype.link.length).toBe(0);
});
