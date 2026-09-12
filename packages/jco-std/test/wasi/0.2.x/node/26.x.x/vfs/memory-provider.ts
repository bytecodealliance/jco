import { expect, test } from "vitest";
import { vfs, memory } from "../helpers/vfs.js";

test("setReadOnly prevents new writes while preserving stored content", async () => {
  const fs = memory();
  fs.writeFileSync("/file", "stored");
  (fs.provider as InstanceType<typeof vfs.MemoryProvider>).setReadOnly();
  expect(fs.readonly).toBe(true);
  expect(fs.readFileSync("/file", "utf8")).toBe("stored");
  expect(() => fs.writeFileSync("/file", "changed")).toThrow(
    expect.objectContaining({ code: "EROFS" }),
  );
  await expect(fs.promises.mkdir("/new")).rejects.toMatchObject({ code: "EROFS" });
});
