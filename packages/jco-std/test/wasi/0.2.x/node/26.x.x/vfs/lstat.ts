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
  test(`${name}: inspects symlinks without following them`, async () => {
    const fs = implementation.create({ emitExperimentalWarning: false });
    fs.writeFileSync("/file", "data");
    fs.symlinkSync("/file", "/link");
    expect(fs.lstatSync("/link").isSymbolicLink()).toBe(true);
    expect(fs.statSync("/link").isFile()).toBe(true);
    expect((await fs.promises.lstat("/link")).isSymbolicLink()).toBe(true);
  });
}
