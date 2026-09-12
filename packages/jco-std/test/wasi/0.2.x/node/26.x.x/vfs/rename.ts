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
  test(`${name}: moves entries and replaces a destination file`, async () => {
    const fs = implementation.create({ emitExperimentalWarning: false });
    fs.writeFileSync("/old", "old");
    fs.writeFileSync("/new", "new");
    fs.renameSync("/old", "/new");
    expect(fs.existsSync("/old")).toBe(false);
    expect(fs.readFileSync("/new", "utf8")).toBe("old");
    fs.mkdirSync("/dir");
    await fs.promises.rename("/new", "/dir/file");
    expect(fs.readdirSync("/dir")).toEqual(["file"]);
  });
}
