import { expect, test } from "vitest";
import { createScript, Script } from "../../../../../../src/wasi/0.2.x/node/24.x.x/vm.js";

test("createScript constructs reusable scripts and accepts filename shorthand", () => {
  const script = createScript("6 * 7", "answer.js");
  expect(script).toBeInstanceOf(Script);
  expect(script.runInThisContext()).toBe(42);
  expect(() => createScript("return")).toThrow(SyntaxError);
});
