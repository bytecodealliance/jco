import { expect, test } from "vitest";
import { harness } from "../helpers/test.js";
test("expected failures match predicates and reject unexpected passes", async () => {
  const h = harness();
  await h.test.expectFailure("expected", (): never => {
    throw new Error("expected");
  });
  await h.test("match", { expectFailure: /match/ }, (): never => {
    throw new Error("match");
  });
  await h.test("mismatch", { expectFailure: /different/ }, (): never => {
    throw new Error("match");
  });
  await h.test.expectFailure("unexpected pass", (): void => {});
  await h.drain();
  expect(h.events.flatMap((e) => (e.type === "test:pass" ? [e.data.name] : []))).toEqual([
    "expected",
    "match",
  ]);
  expect(h.results().at(-1)?.details.error?.failureType).toBe("expectedFailure");
  expect(h.results()[2].details.error?.message).toMatch(/did not match/);
});
