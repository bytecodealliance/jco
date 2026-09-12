import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "vitest";
import { createFilesystem } from "@bytecodealliance/preview2-shim/filesystem";
import { createWasiVfs } from "../../../../../../src/wasi/0.2.x/node/26.x.x/vfs/wasi-filesystem.js";
import type { Descriptor } from "../../../../../../src/wasi/0.2.x/node/26.x.x/vfs/wasi-types.js";
import { withDirectory } from "../helpers/vfs.js";

for (const custom of [false, true]) {
  test(`WASI preopen storage with ${custom ? "custom resolver" : "longest-prefix default"}`, async () => {
    await withDirectory(async (root) => {
      await mkdir(join(root, "storage"));
      const filesystem = createFilesystem({ preopens: { "/data": root } });
      const preopens = {
        getDirectories: () =>
          filesystem.preopens.getDirectories() as unknown as [Descriptor, string][],
      };
      let resolved = 0;
      const vfs = createWasiVfs({
        preopens,
        ...(custom
          ? {
              resolveRoot: (
                _rootPath: string,
                entries: readonly (readonly [Descriptor, string])[],
              ) => {
                resolved++;
                return { descriptor: entries[0][0], directory: "storage" };
              },
            }
          : {}),
      });
      vfs.create().writeFileSync("/memory", "local");
      expect(resolved).toBe(0);
      const fs = vfs.create(new vfs.RealFSProvider(custom ? "/virtual" : "/data/storage"));
      fs.mkdirSync("/nested");
      fs.writeFileSync("/nested/file", "wasi");
      fs.appendFileSync("/nested/file", "+append");
      expect(fs.readFileSync("/nested/file", "utf8")).toBe("wasi+append");
      expect(await readFile(join(root, "storage", "nested", "file"), "utf8")).toBe("wasi+append");
      fs.symlinkSync("file", "/nested/link");
      expect(fs.realpathSync("/nested/link")).toBe("/nested/file");
      expect(fs.readdirSync("/nested").sort()).toEqual(["file", "link"]);
      await fs.promises.rm("/nested", { recursive: true });
      expect(fs.existsSync("/nested")).toBe(false);
      expect(resolved).toBe(custom ? 1 : 0);
    });
  });
}
