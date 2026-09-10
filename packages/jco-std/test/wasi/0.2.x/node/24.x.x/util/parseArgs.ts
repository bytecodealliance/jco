import { expect } from "vitest";
import { util, native, test, capture } from "../helpers/util.js";

test("parseArgs matches short groups, negation, defaults, positionals and tokens", () => {
  const options = {
    verbose: { type: "boolean", short: "v", multiple: true },
    file: { type: "string", short: "f" },
    color: { type: "boolean", default: true },
  } as const;
  for (const args of [
    [],
    ["-vvfinput", "rest"],
    ["--no-color", "--file=x"],
    ["--", "-x"],
    ["--unknown"],
    ["--file", "-v"],
    ["--color=false"],
  ]) {
    const config = { args, options, allowPositionals: true, allowNegative: true, tokens: true };
    expect(capture(() => util.parseArgs(config))).toEqual(capture(() => native.parseArgs(config)));
  }
  expect(
    util.parseArgs({ args: [], options: { name: { type: "string", default: "safe" } } }).values
      .name,
  ).toBe("safe");
  expect(Object.getPrototypeOf(util.parseArgs({ args: [] }).values)).toBeNull();
  expect(() => util.parseArgs()).toThrow(
    expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
  );
});

test("parseArgs accepts unknown options and string values in non-strict mode", () => {
  const config = {
    args: ["--unknown=value", "--flag=text"],
    strict: false,
    options: { flag: { type: "boolean" } },
  } as const;
  const input = { ...config, args: [...config.args] };
  expect(util.parseArgs(input)).toEqual(native.parseArgs(input));
});
