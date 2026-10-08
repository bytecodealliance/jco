import { expect, test } from "vitest";
import native from "node:util";
import util from "../../../../../../src/wasi/0.2.x/node/24.x.x/util/index.js";

test("_extend mutates its target and copies enumerable fields like Node", () => {
  for (const source of [{ a: 2, b: 3 }, null, 3, "abc", [1, 2]]) {
    const actual = { a: 1 };
    const expected = { a: 1 };
    expect(util._extend(actual, source)).toBe(actual);
    native._extend(expected, source as object);
    expect(actual).toEqual(expected);
  }
});
