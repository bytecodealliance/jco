import { expect, test } from "vitest";
import { lcov } from "../../../../../../src/wasi/0.2.x/node/24.x.x/test/reporters.js";
import { lcov as native } from "node:test/reporters";
import { text } from "../../../../../../src/wasi/0.2.x/node/24.x.x/stream/consumers.js";
import type { TestEvent } from "../../../../../../src/wasi/0.2.x/node/24.x.x/test/types.js";
test("LCOV uses shared path/streams and matches Node's coverage encoding", async () => {
  const event: TestEvent = {
    type: "test:coverage",
    data: {
      nesting: 0,
      summary: {
        workingDirectory: "/work",
        files: [
          {
            path: "/work/source.js",
            functions: [{ name: "", line: 1, count: 1 }],
            branches: [{ line: 2, count: 0 }],
            lines: [
              { line: 2, count: 0 },
              { line: 1, count: 1 },
            ],
            totalFunctionCount: 1,
            coveredFunctionCount: 1,
            totalBranchCount: 1,
            coveredBranchCount: 0,
            totalLineCount: 2,
            coveredLineCount: 1,
          },
        ],
      },
    },
  };
  const reporter = new lcov();
  reporter.end(event);
  const oracle = native();
  oracle.end(event);
  const actual = await text(reporter);
  expect(actual).toBe(await text(oracle));
  expect(actual).toContain("SF:source.js\n");
  expect(actual).toContain("DA:1,1\nDA:2,0\n");
});
