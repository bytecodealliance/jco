import nativeProcess from "node:process";
import { expect, test } from "vitest";
import { process, createProcess, denied } from "../helpers/process.js";
test("getegid is native on this platform", () => {
  if (!nativeProcess.getegid) {
    return;
  }
  expect(process.getegid()).toEqual(nativeProcess.getegid());
  expect(() => createProcess(denied).getegid()).toThrow(
    expect.objectContaining({ code: "ERR_JCO_PROCESS_ADAPTER_REQUIRED" }),
  );
});
