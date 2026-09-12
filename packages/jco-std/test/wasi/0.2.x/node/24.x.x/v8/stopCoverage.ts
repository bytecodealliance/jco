import { expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { blocked, deniedError, runNode } from "../helpers/v8.js";

test("stopCoverage controls real host coverage in an isolated process", async () => {
  const directory = await mkdtemp(join(tmpdir(), "v8-coverage-"));

  try {
    expect(
      await runNode(
        `
      import { readdirSync } from 'node:fs';
      function measured() { return 42; }
      measured();
      v8.takeCoverage();
      const before = readdirSync(process.env.NODE_V8_COVERAGE).length;
      v8.stopCoverage();
      v8.takeCoverage();
      console.log(before === readdirSync(process.env.NODE_V8_COVERAGE).length);
    `,
        { NODE_V8_COVERAGE: directory },
      ),
    ).toBe("true");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  expect(() => blocked.stopCoverage()).toThrow(expect.objectContaining(deniedError));
});
