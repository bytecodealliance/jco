import { expect } from "vitest";
import { util, native, test } from "../helpers/util.js";

test("types.isModuleNamespaceObject recognizes native namespace shape", async () => {
  const url = "data:text/javascript,export const value = 1";
  const namespace: unknown = await import(/* @vite-ignore */ url);
  for (const value of [namespace, null, {}, { [Symbol.toStringTag]: "Module" }]) {
    expect(util.types.isModuleNamespaceObject(value)).toBe(
      native.types.isModuleNamespaceObject(value),
    );
  }
});
