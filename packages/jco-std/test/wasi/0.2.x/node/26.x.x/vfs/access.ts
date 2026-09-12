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
  test(`${name}: checks owner permission bits`, async () => {
    const fs = implementation.create({ emitExperimentalWarning: false });
    fs.writeFileSync("/file", "x", { mode: 0o400 });
    fs.accessSync("/file", 4);
    expect(() => fs.accessSync("/file", 2)).toThrow(expect.objectContaining({ code: "EACCES" }));
    expect(() => fs.accessSync("/missing")).toThrow(expect.objectContaining({ code: "ENOENT" }));
  });
}
