import nativeProcess from "node:process";
import { expect, test } from "vitest";
import { process, errorOf } from "../helpers/process.js";
test("kill signal zero checks the real host PID and native errors survive", () => {
  expect(process.kill(nativeProcess.pid, 0)).toBe(true);
  for (const signal of ["BAD_SIGNAL", 1.5]) {
    expect(errorOf(() => process.kill(nativeProcess.pid, signal))).toEqual(
      errorOf(() => nativeProcess.kill(nativeProcess.pid, signal)),
    );
  }
});
