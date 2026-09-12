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
