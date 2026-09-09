// `repl.isValidSyntax`, differential against Node's, plus the object-literal detection it pairs with.
import native from "node:repl";
import { expect, test } from "vitest";
import repl from "../../../../../../src/wasi/0.2.x/node/24.x.x/repl.js";
import { isObjectLiteral } from "../../../../../../src/wasi/0.2.x/node/24.x.x/repl/utils.js";
import { hostIsTargetNode } from "../helpers/assert.js";

const cases = [
  "1 + 1",
  "{ a: 1 }",
  "{ a: 1 };",
  "{ a: 1, b: 2 }",
  "{ 'quoted': 1 }",
  "await 1",
  "const x = await y",
  "function f() {",
  "foo bar",
  "",
  "   ",
  "() => {}",
  "class A { #p = 1 }",
  "import('x')",
  "import x from 'y'",
  "yield 1",
  "for (;;) {}",
  "label: { break label }",
  "1 +",
  "/regex/u",
  "a?.b ?? c",
];

test.skipIf(!hostIsTargetNode).concurrent("isValidSyntax agrees with Node on every case", () => {
  for (const code of cases) {
    expect(repl.isValidSyntax(code), JSON.stringify(code)).toBe(native.isValidSyntax(code));
  }
});

test.concurrent("isValidSyntax accepts expressions that only parse as assignments", () => {
  expect(repl.isValidSyntax("{ a: 1, b: 2 }")).toBe(true);
  expect(repl.isValidSyntax("await 1")).toBe(true);
  expect(repl.isValidSyntax("function f() {")).toBe(false);
  expect(repl.isValidSyntax("1 +")).toBe(false);
});

test.concurrent("isObjectLiteral wants a leading brace and no trailing semicolon", () => {
  expect(isObjectLiteral("{ a: 1 }")).toBe(true);
  expect(isObjectLiteral("  { a: 1 }")).toBe(true);
  expect(isObjectLiteral("{ a: 1 };")).toBe(false);
  expect(isObjectLiteral("{ a: 1 };  ")).toBe(false);
  expect(isObjectLiteral("x = { a: 1 }")).toBe(false);
});
