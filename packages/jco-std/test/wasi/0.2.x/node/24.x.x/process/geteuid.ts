import nativeProcess from "node:process";
import { expect, test } from "vitest";
import { process, createProcess, denied } from "../helpers/process.js";
test("geteuid is native on this platform", () => {
  if (!nativeProcess.geteuid) {
    return;
  }
  expect(process.geteuid()).toEqual(nativeProcess.geteuid());
  expect(() => createProcess(denied).geteuid()).toThrow(
    expect.objectContaining({ code: "ERR_JCO_PROCESS_ADAPTER_REQUIRED" }),
  );
});
