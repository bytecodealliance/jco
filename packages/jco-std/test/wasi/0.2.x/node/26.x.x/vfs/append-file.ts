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
  test(`${name}: appends without truncating and honors an explicit replacement flag`, async () => {
    const fs = implementation.create({ emitExperimentalWarning: false });
    fs.writeFileSync("/file", "a");
    fs.appendFileSync("/file", "b");
    await fs.promises.appendFile("/file", "c");
    expect(fs.readFileSync("/file", "utf8")).toBe("abc");
    fs.appendFileSync("/file", "reset", { flag: "w" });
    expect(fs.readFileSync("/file", "utf8")).toBe("reset");
  });
}
