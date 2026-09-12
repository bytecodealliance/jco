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
  test(`${name}: returns immutable file content and MIME type`, async () => {
    const fs = implementation.create({ emitExperimentalWarning: false });
    fs.writeFileSync("/file", "blob");
    const blob = fs.openAsBlob("/file", { type: "text/plain" });
    fs.writeFileSync("/file", "changed");
    expect(await blob.text()).toBe("blob");
    expect(blob.type).toBe("text/plain");
  });
}
