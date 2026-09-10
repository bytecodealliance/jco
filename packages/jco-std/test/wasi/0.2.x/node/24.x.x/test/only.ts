import { expect, test } from "vitest";
import { harness } from "../helpers/test.js";
test("only selects tests in explicit only mode and otherwise emits a diagnostic", async () => {
  const h = harness(true);
  const calls: string[] = [];
  await h.test("skip", (): void => {
    calls.push("skip");
  });
  await h.test.only("run", (): void => {
    calls.push("run");
  });
  await h.drain();
  expect(calls).toEqual(["run"]);
  const normal = harness();
  await normal.test.only("warning");
  await normal.drain();
  expect(
    normal.events.some(
      (e) => e.type === "test:diagnostic" && e.data.message.includes("--test-only"),
    ),
  ).toBe(true);
});
