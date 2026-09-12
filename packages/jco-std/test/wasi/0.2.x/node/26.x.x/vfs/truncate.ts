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
  test(`${name}: shrinks files and zero-fills growth`, async () => {
    const fs = implementation.create({ emitExperimentalWarning: false });
    fs.writeFileSync("/file", "abcdef");
    fs.truncateSync("/file", 3);
    expect(fs.readFileSync("/file", "utf8")).toBe("abc");
    await fs.promises.truncate("/file", 5);
    expect([...(fs.readFileSync("/file") as Uint8Array)]).toEqual([97, 98, 99, 0, 0]);
  });
}
