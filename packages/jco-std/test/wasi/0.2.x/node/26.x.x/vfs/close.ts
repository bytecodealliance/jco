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
  test(`${name}: invalidates descriptors and reports double close`, async () => {
    const fs = implementation.create({ emitExperimentalWarning: false });
    fs.writeFileSync("/file", "x");
    const fd = fs.openSync("/file");
    fs.closeSync(fd);
    expect(() => fs.closeSync(fd)).toThrow(expect.objectContaining({ code: "EBADF" }));
  });
}
