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
  test(`${name}: converts seconds and dates into timestamps`, async () => {
    const fs = implementation.create({ emitExperimentalWarning: false });
    fs.writeFileSync("/file", "x");
    fs.utimesSync("/file", 10, new Date(20000));
    expect(fs.statSync("/file")).toMatchObject({ atimeMs: 10000, mtimeMs: 20000 });
  });
}
