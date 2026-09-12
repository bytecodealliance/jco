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
  test(`${name}: lists recursive entries and their parent directories`, async () => {
    const fs = implementation.create({ emitExperimentalWarning: false });
    fs.mkdirSync("/dir/sub", { recursive: true });
    fs.writeFileSync("/dir/sub/file", "x");
    expect(fs.readdirSync("/dir", { recursive: true })).toEqual(["sub", "sub/file"]);
    const entries = fs.readdirSync("/dir", { withFileTypes: true });
    expect(entries[0]).toMatchObject({ name: "sub", parentPath: "/dir" });
    expect(fs.readdirSync("/dir/sub")).toEqual(["file"]);
  });
}
