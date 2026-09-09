import { expect, test } from "vitest";
import { createProcess, denied } from "../helpers/process.js";
test("execve requires a grant; a returning provider cannot fake success", () => {
  const args = ["/does-not-exist", []];
  expect(() => Reflect.apply(createProcess(denied).execve, null, args)).toThrow(
    expect.objectContaining({ code: "ERR_JCO_PROCESS_ADAPTER_REQUIRED" }),
  );
  expect(() =>
    Reflect.apply(createProcess({ ...denied, execve: () => undefined }).execve, null, args),
  ).toThrow(expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }));
});
