import { expect, test } from "vitest";
import { createProcess, denied } from "../helpers/process.js";
test("abort requires a grant; a returning provider cannot fake success", () => {
  const args = [];
  expect(() => Reflect.apply(createProcess(denied).abort, null, args)).toThrow(
    expect.objectContaining({ code: "ERR_JCO_PROCESS_ADAPTER_REQUIRED" }),
  );
  expect(() =>
    Reflect.apply(createProcess({ ...denied, abort: () => undefined }).abort, null, args),
  ).toThrow(expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }));
});
