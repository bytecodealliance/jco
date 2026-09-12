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
  test(`${name}: copies bytes and rejects an existing exclusive destination`, async () => {
    const fs = implementation.create({ emitExperimentalWarning: false });
    fs.writeFileSync("/source", "copy");
    fs.copyFileSync("/source", "/dest");
    expect(fs.readFileSync("/dest", "utf8")).toBe("copy");
    expect(() => fs.copyFileSync("/source", "/dest", 1)).toThrow(
      expect.objectContaining({ code: "EEXIST" }),
    );
  });
}
