import { expect, test } from "vitest";

import { p, shim } from "../helpers/perf-hooks.js";

const poison = new Proxy(
  {},
  {
    get() {
      throw new Error("argument touched");
    },
  },
);

test.each([
  ["createHistogram", () => shim.createHistogram(poison)],
  ["monitorEventLoopDelay", () => shim.monitorEventLoopDelay(poison)],
  ["eventLoopUtilization", () => Reflect.apply(shim.eventLoopUtilization, null, [poison])],
  ["performance.nodeTiming", () => p.nodeTiming],
  ["performance.toJSON", () => p.toJSON()],
])("%s explicitly denies native telemetry without touching arguments", (_, call) => {
  expect(call).toThrow(expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }));
});
