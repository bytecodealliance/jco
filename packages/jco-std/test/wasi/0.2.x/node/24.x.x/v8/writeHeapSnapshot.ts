import { expect, test } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { v8, blocked, deniedError } from "../helpers/v8.js";

test("writes a real snapshot to the requested host path", async () => {
  const directory = await mkdtemp(join(tmpdir(), "v8-snapshot-"));
  const filename = join(directory, "snapshot.heapsnapshot");

  try {
    expect(v8.writeHeapSnapshot(filename)).toBe(filename);
    expect(JSON.parse(await readFile(filename, "utf8")).nodes.length).toBeGreaterThan(0);
    expect(() => blocked.writeHeapSnapshot(filename)).toThrow(expect.objectContaining(deniedError));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  expect(() => Reflect.apply(v8.writeHeapSnapshot, null, [42])).toThrow(
    expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
  );
});
