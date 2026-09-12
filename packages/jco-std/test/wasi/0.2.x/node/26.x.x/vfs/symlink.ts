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
  test(`${name}: rejects loops and preserves dangling links`, async () => {
    const fs = implementation.create({ emitExperimentalWarning: false });
    fs.symlinkSync("/b", "/a");
    fs.symlinkSync("/a", "/b");
    expect(() => fs.statSync("/a")).toThrow(expect.objectContaining({ code: "ELOOP" }));
    fs.symlinkSync("/absent", "/dangling");
    expect(fs.lstatSync("/dangling").isSymbolicLink()).toBe(true);
    expect(fs.existsSync("/dangling")).toBe(false);
  });
}
