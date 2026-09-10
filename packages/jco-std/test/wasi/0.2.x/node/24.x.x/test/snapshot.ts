import { expect, test } from "vitest";
import { harness } from "../helpers/test.js";
test("snapshot APIs reject before serializers, path callbacks or values are accessed", async () => {
  const h = harness();
  let touched = false;
  expect(() =>
    h.test.snapshot.setDefaultSnapshotSerializers([
      (): string => {
        touched = true;
        return "";
      },
    ]),
  ).toThrow(/not supported/);
  expect(() =>
    h.test.snapshot.setResolveSnapshotPath((): string => {
      touched = true;
      return "";
    }),
  ).toThrow(/not supported/);
  await h.test("snapshots", (t): void => {
    const value = {
      get value(): never {
        touched = true;
        throw new Error("getter");
      },
    };
    expect(() => t.assert.snapshot(value)).toThrow(/not supported/);
    expect(() => t.assert.fileSnapshot(value, "somewhere")).toThrow(/not supported/);
  });
  await h.drain();
  expect(touched).toBe(false);
});
