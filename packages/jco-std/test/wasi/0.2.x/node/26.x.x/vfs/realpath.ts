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
  test(`${name}: resolves relative symlinks`, async () => {
    const fs = implementation.create({ emitExperimentalWarning: false });
    fs.mkdirSync("/dir");
    fs.writeFileSync("/file", "x");
    fs.symlinkSync("../file", "/dir/link");
    expect(fs.realpathSync("/dir/link")).toBe("/file");
    expect(await fs.promises.realpath("/dir/link")).toBe("/file");
  });
}
