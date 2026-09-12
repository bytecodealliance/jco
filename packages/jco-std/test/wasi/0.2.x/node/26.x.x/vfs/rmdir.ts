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
  test(`${name}: refuses nonempty directories`, async () => {
    const fs = implementation.create({ emitExperimentalWarning: false });
    fs.mkdirSync("/dir");
    fs.writeFileSync("/dir/file", "x");
    expect(() => fs.rmdirSync("/dir")).toThrow(expect.objectContaining({ code: "ENOTEMPTY" }));
    fs.unlinkSync("/dir/file");
    fs.rmdirSync("/dir");
    expect(fs.existsSync("/dir")).toBe(false);
  });
}
