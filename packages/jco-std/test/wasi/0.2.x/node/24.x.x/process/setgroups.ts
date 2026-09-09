import { expect, test } from "vitest";
import { process, createProcess, denied } from "../helpers/process.js";
test("setgroups validates all IDs before reaching a provider", () => {
  expect(() => process.setgroups([-1])).toThrow(
    expect.objectContaining({ code: "ERR_OUT_OF_RANGE" }),
  );
  expect(() => createProcess(denied).setgroups([])).toThrow(
    expect.objectContaining({ code: "ERR_JCO_PROCESS_ADAPTER_REQUIRED" }),
  );
});
