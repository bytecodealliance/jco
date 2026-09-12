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
  test(`${name}: iterates entries and closes directory handles`, async () => {
    const fs = implementation.create({ emitExperimentalWarning: false });
    fs.mkdirSync("/dir");
    fs.writeFileSync("/dir/file", "x");
    const dir = fs.opendirSync("/dir");
    expect(dir.readSync()?.name).toBe("file");
    expect(dir.readSync()).toBeNull();
    dir.closeSync();
    expect(() => dir.readSync()).toThrow(expect.objectContaining({ code: "ERR_DIR_CLOSED" }));
  });
}
