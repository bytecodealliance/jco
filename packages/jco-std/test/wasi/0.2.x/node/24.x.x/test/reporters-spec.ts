import { expect, test } from "vitest";
import { spec } from "../../../../../../src/wasi/0.2.x/node/24.x.x/test/reporters.js";
import { spec as native } from "node:test/reporters";
import { text } from "../../../../../../src/wasi/0.2.x/node/24.x.x/stream/consumers.js";
test("spec is callable and constructible and formats test results like Node", async () => {
  const event = {
    type: "test:pass",
    data: { name: "one", nesting: 0, testNumber: 1, details: { type: "test", duration_ms: 2 } },
  };
  const reporter = spec();
  reporter.end(event);
  const oracle = native();
  oracle.end(event);
  expect(await text(reporter)).toBe(await text(oracle));
  const constructed = new spec();
  constructed.end(event);
  expect(await text(constructed)).toBe("✔ one (2ms)\n");
});
