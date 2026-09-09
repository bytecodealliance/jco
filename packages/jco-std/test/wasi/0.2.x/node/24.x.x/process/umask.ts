import nativeProcess from "node:process";
import { expect, test } from "vitest";
import { process } from "../helpers/process.js";
test("only the non-deprecated setting overload reaches the host", () => {
  expect(() => process.umask()).toThrow(
    expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API" }),
  );
  expect(() => process.umask(-1)).toThrow(expect.objectContaining({ code: "ERR_OUT_OF_RANGE" }));
  const old = nativeProcess.umask();
  try {
    expect(process.umask(old)).toBe(old);
  } finally {
    nativeProcess.umask(old);
  }
});
