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
  test(`${name}: truncates an open virtual descriptor`, async () => {
    const fs = implementation.create({ emitExperimentalWarning: false });
    fs.writeFileSync("/file", "abcdef");
    const fd = fs.openSync("/file", "r+");
    fs.ftruncateSync(fd, 2);
    expect(fs.readFileSync("/file", "utf8")).toBe("ab");
    fs.closeSync(fd);
    expect(() => fs.ftruncateSync(fd, 0)).toThrow(expect.objectContaining({ code: "EBADF" }));
  });
}
