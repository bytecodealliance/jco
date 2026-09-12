import { expect, test } from "vitest";
import { vfs, oracle } from "../helpers/vfs.js";

const native = oracle();
const implementations = native
  ? ([
      ["shim", vfs],
      ["Node 26.8.2", native],
    ] as const)
  : ([["shim", vfs]] as const);

for (const [name, implementation] of implementations) {
  test(`${name}: returns file metadata and bigint fields`, async () => {
    const fs = implementation.create({ emitExperimentalWarning: false });
    fs.writeFileSync("/file", "four");
    expect(fs.statSync("/file").isFile()).toBe(true);
    expect(fs.statSync("/file").size).toBe(4);
    expect(fs.statSync("/file", { bigint: true }).size).toBe(4n);
    const directory = await fs.promises.stat("/");
    expect(directory.isDirectory()).toBe(true);
    expect(directory.size).toBe(4096);
    expect(directory.blocks).toBe(8);
    expect(() => fs.statSync("/missing")).toThrow(expect.objectContaining({ code: "ENOENT" }));
  });
}
