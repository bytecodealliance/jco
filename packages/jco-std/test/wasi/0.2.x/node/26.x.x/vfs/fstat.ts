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
  test(`${name}: reports metadata for open descriptors`, async () => {
    const fs = implementation.create({ emitExperimentalWarning: false });
    fs.writeFileSync("/file", "abc");
    const fd = fs.openSync("/file");
    expect(fs.fstatSync(fd).size).toBe(3);
    fs.closeSync(fd);
    expect(() => fs.fstatSync(fd)).toThrow(expect.objectContaining({ code: "EBADF" }));
  });
}
