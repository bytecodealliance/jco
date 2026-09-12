import { Buffer } from "node:buffer";
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
  test(`${name}: writes at a chosen offset and retains append semantics`, async () => {
    const fs = implementation.create({ emitExperimentalWarning: false });
    fs.writeFileSync("/file", "abc");
    const fd = fs.openSync("/file", "r+");
    expect(fs.writeSync(fd, Buffer.from("X"), 0, 1, 1)).toBe(1);
    fs.closeSync(fd);
    expect(fs.readFileSync("/file", "utf8")).toBe("aXc");
    const append = fs.openSync("/file", "a");
    fs.writeSync(append, Buffer.from("!"), 0, 1, 0);
    fs.closeSync(append);
    expect(fs.readFileSync("/file", "utf8")).toBe("aXc!");
  });
}
