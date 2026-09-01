import { Buffer } from "node:buffer";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { fs, promises, withFsFixture } from "../helpers/fs.js";

describe("node:fs descriptors and handles", () => {
  test("supports positional scalar and vector I/O", async () => {
    await withFsFixture((root) => {
      const path = join(root, "descriptor.txt");
      const fd = fs.openSync(path, "w+");
      try {
        expect(fs.writeSync(fd, Buffer.from("abcdef"), 0, 6, 0)).toBe(6);
        expect(fs.writevSync(fd, [Buffer.from("12"), Buffer.from("34")], 6)).toBe(4);

        const first = Buffer.alloc(3);
        const second = Buffer.alloc(3);
        expect(fs.readvSync(fd, [first, second], 2)).toBe(6);
        expect(first.toString()).toBe("cde");
        expect(second.toString()).toBe("f12");

        fs.ftruncateSync(fd, 5);
        expect(fs.fstatSync(fd).size).toBe(5);
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
    });
  });

  test("FileHandle reuses the descriptor core", async () => {
    await withFsFixture(async (root) => {
      const path = join(root, "handle.txt");
      const handle = await promises.open(path, "w+");
      await handle.writeFile("hello");
      const buffer = Buffer.alloc(5);
      expect((await handle.read(buffer, 0, 5, 0)).bytesRead).toBe(5);
      expect(buffer.toString()).toBe("hello");
      expect((await handle.stat()).isFile()).toBe(true);
      await handle.close();
      await expect(handle.close()).resolves.toBeUndefined();
      await expect(handle.stat()).rejects.toMatchObject({ code: "EBADF" });
    });
  });
});
