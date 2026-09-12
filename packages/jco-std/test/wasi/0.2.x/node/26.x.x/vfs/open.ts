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
  test(`${name}: uses virtual descriptor numbers including promise open`, async () => {
    const fs = implementation.create({ emitExperimentalWarning: false });
    fs.writeFileSync("/file", "x");
    const fd = await fs.promises.open("/file", "r");
    expect(typeof fd).toBe("number");
    expect(fd).toBeGreaterThanOrEqual(0x40000000);
    fs.closeSync(fd);
  });
}
