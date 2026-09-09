import nativeProcess from "node:process";
import { expect, test } from "vitest";
import { process, errorOf } from "../helpers/process.js";
test("source map enablement affects host state and preserves validation", () => {
  const old = nativeProcess.sourceMapsEnabled;
  try {
    process.setSourceMapsEnabled(!old);
    expect(process.sourceMapsEnabled).toBe(!old);
    expect(nativeProcess.sourceMapsEnabled).toBe(!old);
    expect(errorOf(() => Reflect.apply(process.setSourceMapsEnabled, null, [1]))).toEqual(
      errorOf(() => Reflect.apply(nativeProcess.setSourceMapsEnabled, null, [1])),
    );
  } finally {
    nativeProcess.setSourceMapsEnabled(old);
  }
});
