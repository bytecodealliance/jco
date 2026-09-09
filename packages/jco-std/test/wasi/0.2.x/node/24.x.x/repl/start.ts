// `repl.start()` and `new REPLServer()`: option handling, legacy positional arguments, and the
// construction-time refusals for what the platform cannot provide.
import native from "node:repl";
import { expect, test } from "vitest";
import repl from "../../../../../../src/wasi/0.2.x/node/24.x.x/repl.js";
import { hostIsTargetNode } from "../helpers/assert.js";
import { ArrayStream, errorCode, open, portable, transcript } from "../helpers/repl.js";

const UNSUPPORTED = "ERR_JCO_UNSUPPORTED_NODE_API";

function streams() {
  return { input: new ArrayStream(), output: new ArrayStream() };
}

test.concurrent("useGlobal false or omitted is refused before any stream is touched", () => {
  for (const options of [{}, { useGlobal: false }, { useGlobal: undefined }]) {
    const { input, output } = streams();
    let touched = 0;
    input.on("newListener", () => touched++);
    expect(errorCode(() => repl.start({ input, output, ...options }))).toBe(UNSUPPORTED);
    expect(() => repl.start({ input, output, ...options })).toThrow(/useGlobal: true/);
    expect(touched).toBe(0);
    expect(output.text).toBe("");
  }
});

test.concurrent("strict mode and breakEvalOnSigint are refused with Node's own conflict first", () => {
  const { input, output } = streams();
  expect(
    errorCode(() =>
      repl.start({ input, output, useGlobal: true, replMode: repl.REPL_MODE_STRICT }),
    ),
  ).toBe(UNSUPPORTED);
  expect(
    errorCode(() => repl.start({ input, output, useGlobal: true, breakEvalOnSigint: true })),
  ).toBe(UNSUPPORTED);
  expect(
    errorCode(() =>
      repl.start({ input, output, useGlobal: true, breakEvalOnSigint: true, eval: () => {} }),
    ),
  ).toBe("ERR_INVALID_REPL_EVAL_CONFIG");
  expect(output.text).toBe("");
});

test.concurrent("requires both streams when only one is given", () => {
  const { input, output } = streams();
  expect(errorCode(() => repl.start({ input, useGlobal: true }))).toBe(UNSUPPORTED);
  expect(errorCode(() => repl.start({ output, useGlobal: true }))).toBe(UNSUPPORTED);
});

test.concurrent("accepts a legacy duplex stream and positional arguments", async () => {
  const duplex = new ArrayStream();
  const instance = repl.start("legacy> ", duplex, undefined, true, undefined, undefined);
  expect(instance.input).toBe(duplex);
  expect(instance.output).toBe(duplex);
  expect(instance.getPrompt()).toBe("legacy> ");
  duplex.run(["21 * 2"]);
  instance.close();
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(duplex.text).toBe("legacy> 42\nlegacy> ");

  const socket = new ArrayStream();
  const viaOption = repl.start({ socket, useGlobal: true, prompt: "" });
  expect(viaOption.input).toBe(socket);
  viaOption.close();
});

test.concurrent("terminal, colors and writer options resolve like Node", () => {
  const { input, output } = streams();
  output.isTTY = true;
  const custom = (value: unknown) => `<${String(value)}>`;
  const instance = repl.start({ input, output, useGlobal: true, writer: custom });
  expect(instance.terminal).toBe(true);
  // A TTY output without getColorDepth colorizes, as Node's shouldColorize decides.
  expect(instance.useColors).toBe(true);
  expect(instance.writer).toBe(custom);
  expect(instance.useGlobal).toBe(true);
  expect(instance.ignoreUndefined).toBe(false);
  expect(instance.replMode).toBe(repl.REPL_MODE_SLOPPY);
  expect(instance.commands.editor).toBeDefined();
  instance.close();

  const plain = repl.start({ ...streams(), useGlobal: true, terminal: true, useColors: true });
  expect(plain.useColors).toBe(true);
  expect(repl.writer.options.colors).toBe(true);
  plain.close();
  const uncolored = repl.start({ ...streams(), useGlobal: true, terminal: false });
  expect(repl.writer.options.colors).toBe(false);
  expect(uncolored.commands.editor).toBeUndefined();
  uncolored.close();
});

test.concurrent("inputStream and outputStream alias input and output", () => {
  const { input, output } = streams();
  const instance = repl.start({ input, output, useGlobal: true });
  expect(instance.inputStream).toBe(input);
  expect(instance.outputStream).toBe(output);
  expect(Object.getOwnPropertyDescriptor(instance, "inputStream")?.enumerable).toBe(false);
  const other = new ArrayStream();
  instance.outputStream = other;
  expect(instance.output).toBe(other);
  instance.close();
});

test.concurrent("a custom evaluator receives code, the global context, a REPL name and a callback", async () => {
  const calls: unknown[] = [];
  const session = open(portable, {
    eval(code: string, context: object, file: string, cb: (e: Error | null, r?: unknown) => void) {
      calls.push([code, context === globalThis, /^REPL\d+$/.test(file)]);
      cb(null, code.trim().toUpperCase());
    },
  });
  session.input.run(["hello", "world"]);
  const text = await session.finish();
  expect(calls).toEqual([
    ["hello\n", true, true],
    ["world\n", true, true],
  ]);
  expect(text).toBe("> 'HELLO'\n> 'WORLD'\n> ");
});

test.concurrent("a custom evaluator's error is reported as Uncaught", async () => {
  const text = await transcript(portable, ["anything"], {
    eval(_code: string, _context: object, _file: string, cb: (e: Error | null) => void) {
      const error = new RangeError("custom");
      error.stack = "RangeError: custom\n    at somewhere (file.js:1:1)";
      cb(error);
    },
  });
  expect(text).toBe("> Uncaught RangeError: custom\n    at <frame>\n> ");
});

test
  .skipIf(!hostIsTargetNode)
  .concurrent("reset and exit events fire in Node's order", async () => {
    for (const api of [repl, native]) {
      const { input, output } = streams();
      const events: string[] = [];
      const instance = api.start({ input, output, useGlobal: true, terminal: false });
      instance.on("exit", () => events.push("exit"));
      instance.on("close", () => events.push("close"));
      instance.close();
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(events).toEqual(["exit", "close"]);
      expect(instance.closed).toBe(true);
    }
  });
