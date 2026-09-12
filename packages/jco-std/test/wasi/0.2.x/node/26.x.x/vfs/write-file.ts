import { Buffer } from "node:buffer";
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
  test(`${name}: replaces file data, accepts bytes and exclusive flags`, async () => {
    const fs = implementation.create({ emitExperimentalWarning: false });
    fs.writeFileSync("/file", "long original");
    fs.writeFileSync("/file", Buffer.from("new"));
    expect(fs.readFileSync("/file", "utf8")).toBe("new");
    expect(() => fs.writeFileSync("/file", "x", { flag: "wx" })).toThrow(
      expect.objectContaining({ code: "EEXIST" }),
    );
    await fs.promises.writeFile("/async", "async");
    expect(fs.readFileSync("/async", "utf8")).toBe("async");
  });
}
