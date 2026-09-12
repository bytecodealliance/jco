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
  test(`${name}: recursively removes trees without following external links`, async () => {
    const fs = implementation.create({ emitExperimentalWarning: false });
    fs.mkdirSync("/dir");
    fs.writeFileSync("/outside", "keep");
    fs.symlinkSync("/outside", "/dir/link");
    expect(() => fs.rmSync("/dir")).toThrow(expect.objectContaining({ code: "EISDIR" }));
    await fs.promises.rm("/dir", { recursive: true });
    expect(fs.readFileSync("/outside", "utf8")).toBe("keep");
    expect(() => fs.rmSync("/missing", { force: true })).not.toThrow();
  });
}
