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
test("records marks with fixed zero duration and checks names", () => {
  expect(p.mark("x", { startTime: 2 }).toJSON()).toEqual(
    node.performance.mark("x", { startTime: 2 }).toJSON(),
  );
  expect(p.getEntries()).toHaveLength(1);
  expect(() => p.mark("nodeStart")).toThrow(
    expect.objectContaining({ code: "ERR_INVALID_ARG_VALUE" }),
  );
  expect(() => Reflect.apply(p.mark, p, [])).toThrow(
    expect.objectContaining({ code: "ERR_MISSING_ARGS" }),
  );
});
