import type { TestContext } from "../../../../../../src/wasi/0.2.x/node/24.x.x/test/context.js";
import { expect, test } from "vitest";
import { harness } from "../helpers/test.js";
test("plans count assertions and subtests, detect mismatches and wait for scheduled assertions", async () => {
  const h = harness();
  await h.test("planned", async (t: TestContext): Promise<void> => {
    t.plan(2);
    t.assert.strictEqual(1, 1);
    await t.test("child");
  });
  await h.test("missing", (t: TestContext): void => {
    t.plan(1);
  });
  await h.test("wait", (t: TestContext): void => {
    t.plan(1, { wait: 50 });
    setTimeout((): void => {
      t.assert.ok(true);
    }, 1);
  });
  await h.test("twice", (t: TestContext): void => {
    t.plan(1);
    t.plan(2);
  });
  await h.drain();
  expect(h.results().find((r) => r.name === "planned")?.details.error).toBeUndefined();
  expect(h.results().find((r) => r.name === "missing")?.details.error?.message).toBe(
    "plan expected 1 assertions but received 0",
  );
  expect(h.results().find((r) => r.name === "wait")?.details.error).toBeUndefined();
  expect(h.results().at(-1)?.details.error?.message).toBe("cannot set plan more than once");
});
