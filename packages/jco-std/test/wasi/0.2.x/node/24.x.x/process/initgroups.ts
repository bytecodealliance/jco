import { expect, test } from "vitest";
import { process, createProcess, denied } from "../helpers/process.js";
test("initgroups validates IDs and denies ungranted credential changes", () => {
  expect(() => process.initgroups(-1, 0)).toThrow(
    expect.objectContaining({ code: "ERR_OUT_OF_RANGE" }),
  );
  expect(() => createProcess(denied).initgroups(0, 0)).toThrow(
    expect.objectContaining({ code: "ERR_JCO_PROCESS_ADAPTER_REQUIRED" }),
  );
});
