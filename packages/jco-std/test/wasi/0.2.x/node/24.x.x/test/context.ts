import { expect, test } from "vitest";
import { harness } from "../helpers/test.js";
import type { TestContext } from "../../../../../../src/wasi/0.2.x/node/24.x.x/test/context.js";
test("context fields, diagnostics, logs, directives and end-of-test signal", async () => {
  const h = harness();
  let context: TestContext | undefined;
  await h.test("context", { tags: ["FAST"] }, (t): void => {
    context = t;
    expect(t.name).toBe("context");
    expect(t.fullName).toBe("context");
    expect(t.filePath).toBeUndefined();
    expect(t.workerId).toBeUndefined();
    expect(t.attempt).toBe(0);
    expect(t.error).toBeNull();
    expect(t.passed).toBe(false);
    expect(t.signal.aborted).toBe(false);
    t.diagnostic("diagnostic");
    t.log("log", { key: 1 });
    t.skip("context skip");
    t.todo("context todo");
  });
  await h.drain();
  expect(context!.signal.aborted).toBe(true);
  expect(h.results()[0]).toMatchObject({
    skip: "context skip",
    todo: "context todo",
    tags: ["fast"],
  });
  expect(h.events).toContainEqual({
    type: "test:log",
    data: { nesting: 0, message: "log", data: { key: 1 } },
  });
});
