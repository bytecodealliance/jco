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
  test(`${name}: returns the stored link target`, async () => {
    const fs = implementation.create({ emitExperimentalWarning: false });
    fs.symlinkSync("../target", "/link");
    expect(fs.readlinkSync("/link")).toBe("../target");
    expect(await fs.promises.readlink("/link")).toBe("../target");
  });
}
