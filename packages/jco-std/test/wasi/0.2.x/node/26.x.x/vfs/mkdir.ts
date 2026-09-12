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
  test(`${name}: creates parents and reports the first directory created`, async () => {
    const fs = implementation.create({ emitExperimentalWarning: false });
    expect(fs.mkdirSync("/a/b", { recursive: true })).toBe("/a");
    expect(fs.mkdirSync("/a/b", { recursive: true })).toBeUndefined();
    expect(() => fs.mkdirSync("/a/b")).toThrow(expect.objectContaining({ code: "EEXIST" }));
    expect(() => fs.mkdirSync("/missing/child")).toThrow(
      expect.objectContaining({ code: "ENOENT" }),
    );
  });
}
