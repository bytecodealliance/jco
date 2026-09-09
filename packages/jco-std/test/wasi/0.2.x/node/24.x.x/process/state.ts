import nativeProcess from "node:process";
import { expect, test } from "vitest";
import { process, errorOf } from "../helpers/process.js";
test("mutable properties are live and retain native exitCode validation", () => {
  const old = {
    title: nativeProcess.title,
    debugPort: nativeProcess.debugPort,
    exitCode: nativeProcess.exitCode,
  };
  try {
    process.title = "jco-process-unit";
    expect(process.title).toBe(nativeProcess.title);
    process.debugPort = 0;
    expect(process.debugPort).toBe(nativeProcess.debugPort);
    process.exitCode = "7";
    expect(process.exitCode).toBe(nativeProcess.exitCode);
    nativeProcess.exitCode = 8;
    expect(process.exitCode).toBe(8);
    expect(
      errorOf(() => {
        process.exitCode = "invalid";
      }),
    ).toEqual(
      errorOf(() => {
        nativeProcess.exitCode = "invalid";
      }),
    );
    process.exitCode = undefined;
    expect(nativeProcess.exitCode).toBeUndefined();
  } finally {
    nativeProcess.title = old.title;
    nativeProcess.debugPort = old.debugPort;
    nativeProcess.exitCode = old.exitCode;
  }
});
