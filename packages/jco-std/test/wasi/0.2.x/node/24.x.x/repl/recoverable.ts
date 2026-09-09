// Incomplete input: which lines wait for more, which fail, and the `Recoverable` error itself.
// Adapted from Node v24.20.0 test/parallel/test-repl-recoverable.js and test-repl-multiline.js.
import { expect, test } from "vitest";
import repl from "../../../../../../src/wasi/0.2.x/node/24.x.x/repl.js";
import { isRecoverableError } from "../../../../../../src/wasi/0.2.x/node/24.x.x/repl/utils.js";
import { hostIsTargetNode } from "../helpers/assert.js";
import { both, open, portable, transcript } from "../helpers/repl.js";

const differential = test.skipIf(!hostIsTargetNode);

test.concurrent("isRecoverableError follows Node's acorn rules", () => {
  const error = new SyntaxError("engine");
  for (const code of [
    "function f() {",
    "{ a: 1,",
    "[1, 2,",
    "`template",
    "/* comment",
    "'line \\\n",
    "if (true) {",
    "(async () => {",
    "class C {",
    "x = {",
  ]) {
    expect(isRecoverableError(error, code), code).toBe(true);
  }
  for (const code of [
    "2e",
    "foo bar baz",
    "'unterminated",
    "let x = ;",
    "function (",
    "}",
    "1 +* 2",
  ]) {
    expect(isRecoverableError(error, code), code).toBe(false);
  }
  expect(isRecoverableError(error, "1 + 1")).toBe(false);
});

differential.concurrent(
  "multi-line input shows the continuation prompt and evaluates once complete",
  async () => {
    const { actual, expected } = await both([
      "function recoverableFn(a,",
      "                       b) {",
      "  return a + b",
      "}",
      "recoverableFn(1, 2)",
      "[1,",
      "2,",
      "3].length",
      "`multi",
      "line`",
      "recoverableFn(",
      ")",
    ]);
    expect(actual).toBe(expected);
    expect(actual).toContain("| | 3\n");
  },
);

differential.concurrent("a buffered command is discarded by .break", async () => {
  const { actual, expected } = await both(["function recoverableStuck() {", ".break", "1"]);
  expect(actual).toBe(expected);
});

test.concurrent("unterminated strings and bad tokens are errors, not continuations", async () => {
  const text = await transcript(portable, ["'abc", "2e", "1"]);
  expect(text).toBe(
    "> 'abc\n^\n\nUncaught SyntaxError: Unterminated string constant\n> 2e\n^\n\nUncaught SyntaxError: Invalid number\n> 1\n> ",
  );
});

test.concurrent("Recoverable wraps the parse error the evaluator saw", async () => {
  const seen: unknown[] = [];
  const session = open(portable, {
    eval(code: string, _c: object, _f: string, cb: (e: Error | null, r?: unknown) => void) {
      if (code.includes("}")) {
        cb(null, "done");
      } else {
        const error = new SyntaxError("Unexpected end of input");
        seen.push(error);
        cb(new repl.Recoverable(error));
      }
    },
  });
  session.input.run(["function () {", "}"]);
  const text = await session.finish();
  expect(text).toBe("> | 'done'\n> ");
  expect(seen).toHaveLength(1);
});
