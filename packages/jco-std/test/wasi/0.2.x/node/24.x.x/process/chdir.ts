import nativeProcess from "node:process";
import { expect, test } from "vitest";
import { process, errorOf } from "../helpers/process.js";
test("chdir propagates native errors with stable syscall and path fields", () => {
  expect(errorOf(() => process.chdir("/jco-process-nonexistent-directory"))).toEqual(
    errorOf(() => nativeProcess.chdir("/jco-process-nonexistent-directory")),
  );
  expect(errorOf(() => Reflect.apply(process.chdir, null, [null]))).toEqual(
    errorOf(() => Reflect.apply(nativeProcess.chdir, null, [null])),
  );
  process.chdir(nativeProcess.cwd());
  expect(process.cwd()).toBe(nativeProcess.cwd());
});
