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
  test(`${name}: changes permission bits`, async () => {
    const fs = implementation.create({ emitExperimentalWarning: false });
    fs.writeFileSync("/file", "x");
    fs.chmodSync("/file", 0o600);
    expect(Number(fs.statSync("/file").mode) & 0o777).toBe(0o600);
    await fs.promises.chmod("/file", 0o400);
    expect(Number(fs.statSync("/file").mode) & 0o777).toBe(0o400);
  });
}
