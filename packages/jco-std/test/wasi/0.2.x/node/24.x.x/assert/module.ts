import { describe, expect, test } from "vitest";
import assert, * as namespace from "../../../../../../src/wasi/0.2.x/node/24.x.x/assert/index.js";

describe("node:assert module", () => {
  test("exposes the Node 24 public surface", () => {
    expect(Object.keys(assert).sort()).toEqual([
      "Assert",
      "AssertionError",
      "CallTracker",
      "deepEqual",
      "deepStrictEqual",
      "doesNotMatch",
      "doesNotReject",
      "doesNotThrow",
      "equal",
      "fail",
      "ifError",
      "match",
      "notDeepEqual",
      "notDeepStrictEqual",
      "notEqual",
      "notStrictEqual",
      "ok",
      "partialDeepStrictEqual",
      "rejects",
      "strict",
      "strictEqual",
      "throws",
    ]);
  });

  test("preserves callable and strict namespace identities", () => {
    expect(typeof assert).toBe("function");
    expect(assert.ok).toBe(assert);
    expect(assert.strict.strict).toBe(assert.strict);
    expect(assert.strict.equal).toBe(assert.strictEqual);
    expect(assert.strict.deepEqual).toBe(assert.deepStrictEqual);
    expect(namespace.default).toBe(assert);
    expect(namespace.strict).toBe(assert.strict);
  });
});
