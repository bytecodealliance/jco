import { expect, test } from "vitest";
import { createProcess, denied } from "../helpers/process.js";
test("exit requires a grant; a returning provider cannot fake success", () => {
  const args = [0];
  expect(() => Reflect.apply(createProcess(denied).exit, null, args)).toThrow(
    expect.objectContaining({ code: "ERR_JCO_PROCESS_ADAPTER_REQUIRED" }),
  );
  expect(() =>
    Reflect.apply(createProcess({ ...denied, exit: () => undefined }).exit, null, args),
  ).toThrow(expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }));
});
