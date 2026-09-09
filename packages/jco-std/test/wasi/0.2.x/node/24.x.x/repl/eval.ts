// The default evaluator: results, errors, `_`/`_error`, ignoreUndefined, and script-scope
// persistence. Differential sessions compare transcripts with Node's REPL over the same streams.
import { expect, test } from "vitest";
import { hostIsTargetNode } from "../helpers/assert.js";
import { both, open, portable, transcript } from "../helpers/repl.js";

const differential = test.skipIf(!hostIsTargetNode);

differential.concurrent(
  "expressions, declarations, objects and function results match Node",
  async () => {
    const { actual, expected } = await both([
      "1 + 1",
      "var evalVarA = 40",
      "evalVarA + 2",
      "function evalFnA() {",
      "  return 7",
      "}",
      "evalFnA()",
      "{ a: 1, b: 'two' }",
      "[1, 2, 3].map((n) => n * 2)",
      "new Map([['k', 1]])",
      "null",
      "undefined",
      "'string'",
      "`template ${1 + 1}`",
      "typeof evalFnA",
    ]);
    expect(actual).toBe(expected);
  },
);

differential.concurrent(
  "runtime errors print as Uncaught and are not recorded in lines",
  async () => {
    const lines = [
      "throw new Error('top')",
      "function evalThrower() { throw new TypeError('deep') }",
      "evalThrower()",
      "1",
    ];
    const { actual, expected } = await both(lines);
    expect(actual).toBe(expected);
    const session = open(portable);
    session.input.run(lines);
    await session.finish();
    expect([...session.repl.lines]).toEqual([
      "function evalThrower() { throw new TypeError('deep') }",
      "1",
    ]);
  },
);

differential.concurrent("syntax errors carry Node's caret decoration", async () => {
  const { actual, expected } = await both(["let evalDup = 1; let evalDup = 2", "foo bar baz"]);
  expect(actual.split("\n")[0]).toBe(expected.split("\n")[0]);
  expect(actual.split("\n")[1]).toBe(expected.split("\n")[1]);
  expect(actual).toContain(
    "Uncaught SyntaxError: Identifier 'evalDup' has already been declared\n",
  );
  expect(actual).toContain(
    "foo bar baz\n    ^\n\nUncaught SyntaxError: Unexpected identifier 'bar'\n",
  );
});

differential.concurrent("_ and _error follow Node's assignment rules", async () => {
  const { actual, expected } = await both([
    "40 + 2",
    "_",
    "_ + 1",
    "throw new Error('kept')",
    "_error.message",
    "_ = 'mine'",
    "5",
    "_",
    "_error = null",
    "throw new Error('ignored')",
    "_error",
  ]);
  expect(actual).toBe(expected);
  expect(actual).toContain("Expression assignment to _ now disabled.\n");
  expect(actual).toContain("Expression assignment to _error now disabled.\n");
});

differential.concurrent("ignoreUndefined suppresses undefined results", async () => {
  const { actual, expected } = await both(["var evalIgnored = 1", "undefined", "evalIgnored"], {
    ignoreUndefined: true,
  });
  expect(actual).toBe(expected);
  expect(actual).toBe("> > > 1\n> ");
});

differential.concurrent(
  "the result of an unfinished object literal is the object, not a block",
  async () => {
    const { actual, expected } = await both(["{ a: 1,", "b: 2 }", "{ evalLabel: 1 };", "({})"]);
    expect(actual).toBe(expected);
  },
);

differential.concurrent("top-level let, const and class persist across lines", async () => {
  const { actual, expected } = await both([
    "let evalLet = 5",
    "evalLet",
    "const evalConst = { n: 1 }",
    "evalConst.n",
    "class EvalKlass { m() { return 3 } }",
    "new EvalKlass().m()",
    "let { evalDestructured } = { evalDestructured: 'd' }",
    "evalDestructured",
    "for (let evalLoop = 0; evalLoop < 2; evalLoop++) {}",
    "typeof evalLoop",
  ]);
  expect(actual).toBe(expected);
});

test.concurrent("persisted let and const become global properties, and const is not enforced across lines", async () => {
  const text = await transcript(portable, [
    "let evalGlobalLet = 1",
    "Object.prototype.hasOwnProperty.call(globalThis, 'evalGlobalLet')",
    "const evalRelaxed = 1",
    "evalRelaxed = 2",
    "evalRelaxed",
    "let evalRelaxed = 3",
    "evalRelaxed",
  ]);
  expect(text).toBe("> undefined\n> true\n> undefined\n> 2\n> 2\n> undefined\n> 3\n> ");
});

test.concurrent("function declarations reach the global object as in Node", async () => {
  const text = await transcript(portable, [
    "function evalGlobalFn() { return 1 }",
    "typeof globalThis.evalGlobalFn",
  ]);
  expect(text).toBe("> undefined\n> 'function'\n> ");
});

test.concurrent("errors thrown asynchronously after evaluation are not routed to the REPL", async () => {
  const session = open(portable);
  let unhandled: unknown;
  const onUnhandled = (reason: unknown) => {
    unhandled = reason;
  };
  process.once("unhandledRejection", onUnhandled);
  session.input.run(["Promise.reject(new Error('later'))"]);
  const text = await session.finish();
  process.removeListener("unhandledRejection", onUnhandled);
  expect(text).toBe("> Promise {}\n> ");
  expect((unhandled as Error)?.message).toBe("later");
});

test.concurrent("a REPL source name reaches the stack on engines that honour sourceURL", async () => {
  const session = open(portable);
  session.input.run(["function evalNamed() { throw new Error('named') }", "evalNamed()"]);
  await session.finish();
  const error = session.repl.lastError as Error;
  expect(error.stack).toMatch(/at evalNamed \(REPL\d+:1:\d+\)/);
  expect(error.stack).not.toContain("runInThisContext");
});

test.concurrent("require in the context refuses with a hint at static imports", async () => {
  const text = await transcript(portable, ["require('node:fs')", "require.resolve('node:fs')"]);
  expect(text).toContain(
    'Uncaught:\nError [ERR_JCO_UNSUPPORTED_NODE_API]: require("node:fs") is not supported',
  );
  expect(text).toContain("static `import`");
  expect(text).toContain("'node:fs'\n> ");
});
