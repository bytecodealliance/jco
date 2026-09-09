import nativeProcess from "node:process";
import { expect, test } from "vitest";
import { process, createProcess, denied } from "../helpers/process.js";
test("getgid is native on this platform", () => {
  if (!nativeProcess.getgid) {
    return;
  }
  expect(process.getgid()).toEqual(nativeProcess.getgid());
  expect(() => createProcess(denied).getgid()).toThrow(
    expect.objectContaining({ code: "ERR_JCO_PROCESS_ADAPTER_REQUIRED" }),
  );
});
