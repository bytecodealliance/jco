import nativeProcess from "node:process";
import { expect, test } from "vitest";
import { process, createProcess, denied } from "../helpers/process.js";
test("getgroups is native on this platform", () => {
  if (!nativeProcess.getgroups) {
    return;
  }
  expect(process.getgroups()).toEqual(nativeProcess.getgroups());
  expect(() => createProcess(denied).getgroups()).toThrow(
    expect.objectContaining({ code: "ERR_JCO_PROCESS_ADAPTER_REQUIRED" }),
  );
});

test("getgroups converts canonical numeric lists into ordinary Node arrays", () => {
  const groups = createProcess({
    ...denied,
    getgroups: () => new Uint32Array([10, 20]),
  }).getgroups();
  expect(Array.isArray(groups)).toBe(true);
  expect(groups).toEqual([10, 20]);
});
