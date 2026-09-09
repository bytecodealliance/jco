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
test("nodeTiming explicitly denies native telemetry without touching arguments", () => {
  const _poison = new Proxy(
    {},
    {
      get() {
        throw new Error("argument touched");
      },
    },
  );
  expect(() => p.nodeTiming).toThrow(
    expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
  );
});
