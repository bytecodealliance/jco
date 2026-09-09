import nativeProcess from "node:process";
import { expect, test } from "vitest";
import { process, createProcess, denied } from "../helpers/process.js";
test("getuid is native on this platform", () => {
  if (!nativeProcess.getuid) {
    return;
  }
  expect(process.getuid()).toEqual(nativeProcess.getuid());
  expect(() => createProcess(denied).getuid()).toThrow(
    expect.objectContaining({ code: "ERR_JCO_PROCESS_ADAPTER_REQUIRED" }),
  );
});
