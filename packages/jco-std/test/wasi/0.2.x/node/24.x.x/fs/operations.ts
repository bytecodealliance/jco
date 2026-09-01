import { Buffer } from "node:buffer";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, test } from "vitest";

import { fs, withFsFixture } from "../helpers/fs.js";

describe("node:fs path operations", () => {
  test("reads, writes, appends, copies, and renames files", async () => {
    await withFsFixture((root) => {
      const source = join(root, "source.txt");
      const copy = join(root, "copy.txt");
      const renamed = join(root, "renamed.txt");

      fs.writeFileSync(source, "héllo", "utf8");
      fs.appendFileSync(source, Buffer.from("!"));
      expect(fs.readFileSync(source, "utf8")).toBe("héllo!");
      expect(Buffer.isBuffer(fs.readFileSync(source))).toBe(true);

      fs.copyFileSync(source, copy);
      fs.renameSync(copy, renamed);
      expect(fs.existsSync(copy)).toBe(false);
      expect(fs.readFileSync(renamed, "utf8")).toBe("héllo!");
      fs.unlinkSync(renamed);
      expect(fs.existsSync(renamed)).toBe(false);
    });
  });

  test("creates, lists, stats, and recursively removes directories", async () => {
    await withFsFixture((root) => {
      const nested = join(root, "a", "b");
      expect(fs.mkdirSync(nested, { recursive: true })).toContain(join(root, "a"));
      fs.writeFileSync(join(nested, "file.txt"), "value");

      const entries = fs.readdirSync(nested, { withFileTypes: true });
      expect(entries).toHaveLength(1);
      const entry = entries[0];
      expect(entry).toBeInstanceOf(fs.Dirent);
      expect(entry.name).toBe("file.txt");
      expect(entry.isFile()).toBe(true);

      const stats = fs.statSync(nested);
      expect(stats).toBeInstanceOf(fs.Stats);
      expect(stats.isDirectory()).toBe(true);
      expect(stats.mtime).toBeInstanceOf(Date);

      fs.rmSync(join(root, "a"), { recursive: true });
      expect(fs.existsSync(nested)).toBe(false);
    });
  });

  test("preserves stable system error fields", async () => {
    await withFsFixture((root) => {
      const missing = join(root, "missing");
      expect(() => fs.readFileSync(missing)).toThrow(
        expect.objectContaining({ code: "ENOENT", path: missing, syscall: "open" }),
      );
    });
  });

  test("preserves file URLs through the host-neutral protocol", async () => {
    await withFsFixture((root) => {
      const url = pathToFileURL(join(root, "file URL.txt"));
      fs.writeFileSync(url, "url");
      expect(fs.readFileSync(url, "utf8")).toBe("url");
      expect(() => fs.readFileSync(new URL("https://example.com/file"))).toThrow(
        expect.objectContaining({ code: "ERR_INVALID_ARG_VALUE" }),
      );
    });
  });

  test("reports closed directory handles with Node's stable code", async () => {
    await withFsFixture((root) => {
      const directory = fs.opendirSync(root);
      directory.closeSync();
      expect(() => directory.readSync()).toThrow(
        expect.objectContaining({ code: "ERR_DIR_CLOSED" }),
      );
    });
  });
});
