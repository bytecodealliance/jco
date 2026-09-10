import { expect, test } from "vitest";
import { tap } from "../../../../../../src/wasi/0.2.x/node/24.x.x/test/reporters.js";
import type { TestEvent } from "../../../../../../src/wasi/0.2.x/node/24.x.x/test/types.js";
test("TAP escapes user-controlled names and reports failure diagnostics", async () => {
  const events: TestEvent[] = [
    { type: "test:start", data: { name: "name\n# SKIP", nesting: 0 } },
    {
      type: "test:pass",
      data: {
        name: "name\n# SKIP",
        nesting: 0,
        testNumber: 1,
        skip: "reason",
        details: { type: "test", duration_ms: 0 },
      },
    },
    { type: "test:plan", data: { nesting: 0, count: 1 } },
  ];
  let text = "";
  for await (const chunk of tap(events)) {
    text += chunk;
  }
  expect(text).toContain("TAP version 13\n");
  expect(text).toContain("# SKIP reason");
  expect(text).toContain("1..1\n");
  expect(text).not.toContain("name\n# SKIP");
  expect(text).toContain('type: "test"');
});
