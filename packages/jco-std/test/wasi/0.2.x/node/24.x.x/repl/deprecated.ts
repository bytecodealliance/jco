// Deprecated surface at the pin: the throwing stub and the documentation-only ones kept working.
import { expect, test } from "vitest";
import repl from "../../../../../../src/wasi/0.2.x/node/24.x.x/repl.js";
import { DEPRECATED_CODE } from "../../../../../../src/wasi/0.2.x/node/24.x.x/errors/core.js";
import { ArrayStream, errorCode } from "../helpers/repl.js";

test.concurrent("REPLServer() without new throws before touching its arguments (DEP0185)", () => {
  const input = new ArrayStream();
  const output = new ArrayStream();
  let touched = 0;
  input.on("newListener", () => touched++);
  const options = {
    get input() {
      touched++;
      return input;
    },
    output,
    useGlobal: true,
  };
  const call = () => (repl.REPLServer as unknown as (options: unknown) => unknown)(options);
  expect(errorCode(call)).toBe(DEPRECATED_CODE);
  expect(call).toThrow(/new REPLServer\(\)/);
  expect(touched).toBe(0);
  expect(output.text).toBe("");
});

test.concurrent("inputStream, outputStream, builtinModules and _builtinLibs stay functional", () => {
  const input = new ArrayStream();
  const output = new ArrayStream();
  const instance = new repl.REPLServer({ input, output, useGlobal: true, terminal: false });
  expect(instance.inputStream).toBe(input);
  expect(instance.outputStream).toBe(output);
  expect(Array.isArray(repl.builtinModules)).toBe(true);
  expect(repl._builtinLibs).toBe(repl.builtinModules);
  instance.close();
});
