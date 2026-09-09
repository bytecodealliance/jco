// The default `writer`, its options object, and the shared inspector's defaults.
import { inspect as nativeInspect } from "node:util";
import { expect, test } from "vitest";
import repl from "../../../../../../src/wasi/0.2.x/node/24.x.x/repl.js";
import { inspectDefaultOptions } from "../../../../../../src/wasi/0.2.x/node/24.x.x/internal/inspect.js";
import { hostIsTargetNode } from "../helpers/assert.js";
import { open, portable, transcript } from "../helpers/repl.js";

test
  .skipIf(!hostIsTargetNode)
  .concurrent("writer.options carries Node's default inspect keys plus showProxy", () => {
    expect(inspectDefaultOptions).toEqual({ ...nativeInspect.defaultOptions });
    expect(Object.keys(repl.writer.options).sort()).toEqual(
      Object.keys({ ...nativeInspect.defaultOptions, showProxy: true }).sort(),
    );
    expect(repl.writer.options.showProxy).toBe(true);
    expect(repl.writer.options.depth).toBe(2);
  });

test.concurrent("writer formats values the way the REPL prints them", () => {
  repl.writer.options.colors = false;
  expect(repl.writer(42)).toBe("42");
  expect(repl.writer("s")).toBe("'s'");
  expect(repl.writer(undefined)).toBe("undefined");
  expect(repl.writer(null)).toBe("null");
  expect(repl.writer([1, "a"])).toBe("[ 1, 'a' ]");
  expect(repl.writer({ a: { b: { c: { d: 1 } } } })).toBe("{ a: { b: { c: [Object] } } }");
  expect(repl.writer(new Map([["k", 1]]))).toBe("Map(1) { 'k' => 1 }");
  expect(repl.writer(Symbol("sym"))).toBe("Symbol(sym)");
  expect(repl.writer(() => {})).toMatch(/^\[Function/);
  expect(repl.writer(10n)).toBe("10n");
});

test.concurrent("writer honours edits to writer.options", () => {
  const depth = repl.writer.options.depth;
  try {
    repl.writer.options.depth = 0;
    expect(repl.writer({ a: { b: 1 } })).toBe("{ a: [Object] }");
    repl.writer.options.colors = true;
    expect(repl.writer(1)).toBe("[33m1[39m");
  } finally {
    repl.writer.options.depth = depth;
    repl.writer.options.colors = false;
  }
});

test.concurrent("errors print through the writer with Uncaught and a trimmed stack", async () => {
  const text = await transcript(portable, [
    "new RangeError('range')",
    "throw new RangeError('range')",
  ]);
  // A value prints with its whole stack, as util.inspect does; an uncaught one is trimmed.
  expect(text.startsWith("> RangeError: range\n    at <frame>\n")).toBe(true);
  expect(text.endsWith("\n> Uncaught RangeError: range\n> ")).toBe(true);
});

test.concurrent("an error whose stack lacks the header line, as on QuickJS, still prints it", () => {
  const framesOnly = new TypeError("no header");
  framesOnly.stack = "    at run (file.js:1:1)";
  expect(repl.writer(framesOnly)).toBe("TypeError: no header\n    at run (file.js:1:1)");
  const empty = new RangeError("bare");
  empty.stack = "";
  expect(repl.writer(empty)).toBe("RangeError: bare");
  const headed = new Error("headed");
  headed.stack = "Error: headed\n    at run (file.js:1:1)";
  expect(repl.writer(headed)).toBe("Error: headed\n    at run (file.js:1:1)");
});

test.concurrent("a custom writer replaces the default for results and errors", async () => {
  const session = open(portable, { writer: (value: unknown) => `[${typeof value}]` });
  session.input.run(["1", "'a'", "throw new Error('e')"]);
  const text = await session.finish();
  // Node strips a writer result's outer brackets on the Uncaught line.
  expect(text).toBe("> [number]\n> [string]\n> Uncaught object\n> ");
});

test.concurrent("useColors switches the shared writer's colors", () => {
  const colored = repl.start({
    input: new (class extends EventTarget {
      on() {
        return this;
      }
      removeListener() {
        return this;
      }
      emit() {
        return false;
      }
      listenerCount() {
        return 0;
      }
      resume() {
        return this;
      }
      pause() {
        return this;
      }
    })() as never,
    output: { write: () => true } as never,
    useGlobal: true,
    terminal: false,
    useColors: true,
  });
  expect(repl.writer.options.colors).toBe(true);
  colored.close();
  repl.writer.options.colors = false;
});
