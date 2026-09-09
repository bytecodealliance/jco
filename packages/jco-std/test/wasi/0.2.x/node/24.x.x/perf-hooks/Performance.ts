import { test, expect, afterEach } from "vitest";
import node from "node:perf_hooks";
import shim from "../../../../../../src/wasi/0.2.x/node/24.x.x/perf-hooks.js";
const { performance: p } = shim;
afterEach(() => {
  p.clearMarks();
  p.clearMeasures();
  p.clearResourceTimings();
  node.performance.clearMarks();
  node.performance.clearMeasures();
});
test("Performance rejects direct construction", () => {
  expect(() => new shim.Performance()).toThrow(
    expect.objectContaining({ code: "ERR_ILLEGAL_CONSTRUCTOR" }),
  );
});

test("validates the receiver before touching arguments", () => {
  const name = {
    toString() {
      throw new Error("coerced");
    },
  };
  expect(() => Reflect.apply(p.mark, {}, [name])).toThrow(
    expect.objectContaining({ code: "ERR_INVALID_THIS" }),
  );
  expect(() => Reflect.apply(p.now, null, [])).toThrow(
    expect.objectContaining({ code: "ERR_INVALID_THIS" }),
  );
});
