// Top-level await: the rewriter itself and sessions using it.
// Adapted from Node v24.20.0 test/parallel/test-repl-top-level-await.js.
import { expect, test } from "vitest";
import { processTopLevelAwait } from "../../../../../../src/wasi/0.2.x/node/24.x.x/repl/await.js";
import { Recoverable } from "../../../../../../src/wasi/0.2.x/node/24.x.x/repl/recoverable.js";
import { hostIsTargetNode } from "../helpers/assert.js";
import { both, open, portable, transcript } from "../helpers/repl.js";

const differential = test.skipIf(!hostIsTargetNode);

test.concurrent("processTopLevelAwait rewrites declarations and returns { value }", () => {
  expect(processTopLevelAwait("await 1")).toBe("(async () => { return { value: (await 1) } })()");
  expect(processTopLevelAwait("const x = await p")).toBe(
    "let x; (async () => { void (x = await p) })()",
  );
  expect(processTopLevelAwait("var a = 1, b = await p")).toBe(
    "var a, b; (async () => { void ( (a = 1), (b = await p)) })()",
  );
  expect(processTopLevelAwait("let { c, d } = await p")).toBe(
    "let c, d; (async () => { void ({ c, d } = await p) })()",
  );
  expect(processTopLevelAwait("let [e, ...rest] = await p")).toBe(
    "let e; (async () => { void ([e, ...rest] = await p) })()",
  );
  expect(processTopLevelAwait("function f() { return 1 }; await f()")).toBe(
    "var f; (async () => { this.f = f; function f() { return 1 }; return { value: (await f()) } })()",
  );
  expect(processTopLevelAwait("class K {}; await 1")).toBe(
    "let K; (async () => { K=class K {}; return { value: (await 1) } })()",
  );
  expect(processTopLevelAwait("for await (const x of y) {}")).toBe(
    "(async () => { for await (const x of y) {} })()",
  );
  expect(processTopLevelAwait("await 1; 2")).toBe(
    "(async () => { await 1; return { value: (2) } })()",
  );
});

test.concurrent("processTopLevelAwait leaves code without await or with a return alone", () => {
  expect(processTopLevelAwait("1 + 1")).toBeNull();
  expect(processTopLevelAwait("return await 1")).toBeNull();
  expect(processTopLevelAwait("const await_ = 1")).toBeNull();
  expect(processTopLevelAwait("foo bar await 1")).toBeNull();
});

test.concurrent("processTopLevelAwait reports incomplete and malformed input like Node", () => {
  expect(() => processTopLevelAwait("await `x")).toThrow(Recoverable);
  const message = (source: string) => {
    try {
      processTopLevelAwait(source);
    } catch (error) {
      expect(error).toBeInstanceOf(SyntaxError);
      return (error as Error).message;
    }
    throw new Error("expected a SyntaxError");
  };
  expect(message("await 1 +")).toBe("\nawait 1 +\n          ^\n\nUnexpected token '+'");
  expect(message("function f() { await 1 }")).toBe(
    "\nfunction f() { await 1 }\n                     ^\n\nUnexpected token '1'",
  );
});

differential.concurrent("awaited values, declarations and rejections match Node", async () => {
  const { actual, expected } = await both([
    "await Promise.resolve(123)",
    "const awaitedConst = await Promise.resolve('c')",
    "awaitedConst",
    "let awaitedLet = 1; awaitedLet = await Promise.resolve(2); awaitedLet",
    "(await Promise.resolve({ y: 'inner' })).y",
    "await Promise.reject(new Error('REPL await'))",
    "for await (const awaitedItem of [Promise.resolve(1), 2]) {}",
    "await 1; await 2; 3",
  ]);
  expect(actual).toBe(expected);
  expect(actual).toContain("Uncaught Error: REPL await\n");
});

test.concurrent("input arriving during an await is replayed afterwards in terminal mode", async () => {
  const session = open(portable, { terminal: true });
  session.repl.write("await new Promise((resolve) => setTimeout(() => resolve('slow'), 20))");
  session.repl.write(null, { name: "return" });
  session.repl.write("'after'");
  session.repl.write(null, { name: "return" });
  await session.settle();
  await session.settle();
  const text = await session.finish();
  expect(text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")).toContain("'slow'");
  expect(text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")).toContain("'after'");
  expect(text.indexOf("'slow'")).toBeLessThan(text.indexOf("'after'\r\n"));
});

test.concurrent("a plain string containing the word await is not rewritten", async () => {
  const text = await transcript(portable, ["'no await here'", "({ await: 1 }).await"]);
  expect(text).toBe("> 'no await here'\n> 1\n> ");
});
