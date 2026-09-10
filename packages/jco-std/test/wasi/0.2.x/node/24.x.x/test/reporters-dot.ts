import { expect, test } from "vitest";
import { dot } from "../../../../../../src/wasi/0.2.x/node/24.x.x/test/reporters.js";
import { dot as native } from "node:test/reporters";
test("dot matches Node's non-terminal line wrapping", async () => {
  const events = Array.from({ length: 21 }, (_, index) => ({
    type: "test:pass" as const,
    data: {
      name: `test ${index}`,
      nesting: 0,
      testNumber: index + 1,
      details: { type: "test" as const, duration_ms: 0 },
    },
  }));
  const actual: string[] = [];
  for await (const chunk of dot(events)) {
    actual.push(chunk);
  }
  async function* source(): AsyncGenerator<(typeof events)[number], void, unknown> {
    yield* events;
  }
  const expected: string[] = [];
  for await (const chunk of native(source())) {
    expected.push(chunk);
  }
  expect(actual.join("")).toBe("....................\n.\n");
  expect(actual).toEqual(expected);
});
