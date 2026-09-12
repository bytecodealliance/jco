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
  test(`${name}: creates a unique directory with a six-character suffix`, async () => {
    const fs = implementation.create({ emitExperimentalWarning: false });
    const first = fs.mkdtempSync("/tmp-");
    const second = await fs.promises.mkdtemp("/tmp-");
    expect(first).toMatch(/^\/tmp-[a-zA-Z0-9]{6}$/);
    expect(first).not.toBe(second);
    expect(fs.statSync(first).isDirectory()).toBe(true);
  });
}
