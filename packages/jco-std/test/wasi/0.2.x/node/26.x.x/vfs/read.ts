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
  test(`${name}: supports sequential and explicit-position descriptor reads`, async () => {
    const fs = implementation.create({ emitExperimentalWarning: false });
    fs.writeFileSync("/file", "abcdef");
    const fd = fs.openSync("/file");
    const data = Buffer.alloc(2);
    expect(fs.readSync(fd, data, 0, 2, null)).toBe(2);
    expect(data.toString()).toBe("ab");
    expect(fs.readSync(fd, data, 0, 2, 4n)).toBe(2);
    expect(data.toString()).toBe("ef");
    fs.readSync(fd, data, 0, 2, null);
    expect(data.toString()).toBe("cd");
    fs.closeSync(fd);
  });
}
