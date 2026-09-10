import { expect, test } from "vitest";
import { junit } from "../../../../../../src/wasi/0.2.x/node/24.x.x/test/reporters.js";
import { junit as native } from "node:test/reporters";
import type { TestEvent } from "../../../../../../src/wasi/0.2.x/node/24.x.x/test/types.js";
test("JUnit matches Node for leaf tests and escapes XML attributes", async () => {
  const events = [
    { type: "test:start", data: { name: 'one<&"', nesting: 0 } },
    {
      type: "test:pass",
      data: {
        name: 'one<&"',
        nesting: 0,
        testNumber: 1,
        details: { type: "test", duration_ms: 1 },
        skip: "later",
      },
    },
  ] satisfies TestEvent[];
  async function* source(): AsyncGenerator<(typeof events)[number], void, unknown> {
    yield* events;
  }
  let actual = "";
  for await (const chunk of junit(source())) {
    actual += chunk;
  }
  let expected = "";
  for await (const chunk of native(source())) {
    expected += chunk;
  }
  expect(actual).toEqual(expected);
  expect(actual).toContain('name="one&lt;&amp;&amp;quot;"');
});
