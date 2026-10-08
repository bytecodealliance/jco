import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { describe, expect, test } from "vitest";
import { fs, promises } from "../helpers/fs.js";

describe("filesystem streams", () => {
  test("copies a binary inclusive range with small buffers and closes descriptors", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jco-fs-stream-"));
    try {
      const bytes = Buffer.from(Array.from({ length: 70000 }, (_, i) => i % 251));
      await writeFile(join(dir, "input"), bytes);
      const input = fs.createReadStream(join(dir, "input"), {
        start: 7,
        end: 66000,
        highWaterMark: 17,
      });
      const output = fs.createWriteStream(join(dir, "output"), { highWaterMark: 19 });
      await pipeline(input, output);
      expect(await readFile(join(dir, "output"))).toEqual(bytes.subarray(7, 66001));
      expect(input.bytesRead).toBe(65994);
      expect(output.bytesWritten).toBe(65994);
      expect(input.fd).toBe(null);
      expect(output.fd).toBe(null);
      expect(input.closed && output.closed).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("file handle streams and append writes preserve bytes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jco-fs-stream-"));
    try {
      const path = join(dir, "file");
      await pipeline(Readable.from(["hello", " world"]), fs.createWriteStream(path));
      await pipeline(Readable.from(["!"]), fs.createWriteStream(path, { flags: "a" }));
      const handle = await promises.open(path, "r");
      const chunks: Buffer[] = [];
      for await (const chunk of handle.createReadStream({ start: 6, end: 10 })) {
        chunks.push(Buffer.from(chunk));
      }
      expect(Buffer.concat(chunks).toString()).toBe("world");
      await handle.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("missing files reject a pipeline and destroy its destination", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jco-fs-stream-"));
    try {
      const output = fs.createWriteStream(join(dir, "output"));
      await expect(
        pipeline(fs.createReadStream(join(dir, "missing")), output),
      ).rejects.toMatchObject({ code: "ENOENT" });
      expect(output.destroyed).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
