import { expect, test } from "vitest";
import { v8, blocked, deniedError, runNode } from "../helpers/v8.js";

test("registers the native near-limit callback and validates its limit", async () => {
  expect(
    await runNode(`
    v8.setHeapSnapshotNearHeapLimit(1);
    v8.setHeapSnapshotNearHeapLimit(1);
    console.log('registered');
  `),
  ).toBe("registered");

  expect(() => v8.setHeapSnapshotNearHeapLimit(0)).toThrow(
    expect.objectContaining({ code: "ERR_OUT_OF_RANGE" }),
  );
  expect(() => blocked.setHeapSnapshotNearHeapLimit(1)).toThrow(
    expect.objectContaining(deniedError),
  );
});
