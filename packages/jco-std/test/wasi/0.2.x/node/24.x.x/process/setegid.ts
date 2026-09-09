import { expect, test } from "vitest";
import { process, createProcess, denied } from "../helpers/process.js";
test("setegid validates without changing credentials and requires a grant", () => {
  expect(() => process.setegid(-1)).toThrow(expect.objectContaining({ code: "ERR_OUT_OF_RANGE" }));
  expect(() => createProcess(denied).setegid(0)).toThrow(
    expect.objectContaining({ code: "ERR_JCO_PROCESS_ADAPTER_REQUIRED" }),
  );
});
