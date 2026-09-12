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
  test(`${name}: changes link ownership without changing its target`, async () => {
    const fs = implementation.create({ emitExperimentalWarning: false });
    fs.writeFileSync("/file", "x");
    fs.symlinkSync("/file", "/link");
    fs.lchownSync("/link", 12, 34);
    expect(fs.lstatSync("/link")).toMatchObject({ uid: 12, gid: 34 });
    expect(fs.statSync("/file").uid).toBe(0);
  });
}
