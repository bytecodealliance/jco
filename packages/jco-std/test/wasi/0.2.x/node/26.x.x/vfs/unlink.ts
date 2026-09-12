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
  test(`${name}: removes a symlink while keeping its target`, async () => {
    const fs = implementation.create({ emitExperimentalWarning: false });
    fs.writeFileSync("/file", "x");
    fs.symlinkSync("/file", "/link");
    fs.unlinkSync("/link");
    expect(fs.existsSync("/link")).toBe(false);
    expect(fs.readFileSync("/file", "utf8")).toBe("x");
    expect(() => fs.unlinkSync("/missing")).toThrow(expect.objectContaining({ code: "ENOENT" }));
  });
}
