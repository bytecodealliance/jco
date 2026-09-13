import { readFile, writeFile, symlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "vitest";
import { realVfs, vfs, withDirectory } from "../helpers/vfs.js";

test("host access is denied by default and lazy", () => {
  const fs = vfs.create(new vfs.RealFSProvider("/data"));
  expect(fs.provider).toBeInstanceOf(vfs.RealFSProvider);
  expect(() => fs.readFileSync("/file")).toThrow(
    expect.objectContaining({ code: "ERR_JCO_FS_ADAPTER_REQUIRED" }),
  );
});

test("Node passthrough reads, writes and rejects escaping symbolic links", async () => {
  await withDirectory(async (root) => {
    await mkdir(join(root, "inside"));
    await writeFile(join(root, "outside"), "secret");
    await symlink("../outside", join(root, "inside", "link"));
    const fs = realVfs.create(new realVfs.RealFSProvider(join(root, "inside")));
    await fs.promises.writeFile("/file", "host");
    expect(await readFile(join(root, "inside", "file"), "utf8")).toBe("host");
    expect(fs.readFileSync("/file", "utf8")).toBe("host");
    expect(() => fs.readFileSync("/link")).toThrow(expect.objectContaining({ code: "ENOENT" }));
  });
});

for (const suffix of ["", "nested"]) {
  test(`Node passthrough accepts a symlink in the root ${suffix ? "ancestor" : "directory"}`, async () => {
    await withDirectory(async (root) => {
      await mkdir(join(root, "storage", "nested"), { recursive: true });
      await symlink("storage", join(root, "alias"), "dir");
      await writeFile(join(root, "outside"), "secret");

      const provider = new realVfs.RealFSProvider(join(root, "alias", suffix));
      const fs = realVfs.create(provider);
      expect(provider.rootPath).toBe(join(root, "alias", suffix));

      fs.mkdirSync("/dir/sub", { recursive: true });
      await fs.promises.writeFile("/dir/sub/file", "stored");
      expect(await readFile(join(root, "storage", suffix, "dir/sub/file"), "utf8")).toBe("stored");
      expect(fs.realpathSync("/dir/sub/file")).toBe("/dir/sub/file");

      fs.symlinkSync("/dir/sub/file", "/link");
      expect(fs.readlinkSync("/link")).toBe("/dir/sub/file");
      expect(fs.readFileSync("/link", "utf8")).toBe("stored");

      await symlink(join(root, "outside"), join(root, "storage", suffix, "escape"));
      expect(() => fs.readFileSync("/escape")).toThrow(expect.objectContaining({ code: "ENOENT" }));
      await fs.promises.rm("/dir", { recursive: true });
      expect(fs.existsSync("/dir")).toBe(false);
    });
  });
}
