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
  test(`${name}: shares a file entry and updates link counts`, async () => {
    const fs = implementation.create({ emitExperimentalWarning: false });
    fs.writeFileSync("/file", "x");
    fs.linkSync("/file", "/alias");
    expect(fs.statSync("/file").nlink).toBe(2);
    fs.writeFileSync("/alias", "shared");
    expect(fs.readFileSync("/file", "utf8")).toBe("shared");
    fs.unlinkSync("/alias");
    expect(fs.statSync("/file").nlink).toBe(1);
  });
}
