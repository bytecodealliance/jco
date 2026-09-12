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
  test(`${name}: reads buffers, encodings, callbacks and promises`, async () => {
    const fs = implementation.create({ emitExperimentalWarning: false });
    fs.writeFileSync("/file", "héllo");
    expect(fs.readFileSync("/file").toString()).toBe("héllo");
    expect(fs.readFileSync("/file", "hex")).toBe(Buffer.from("héllo").toString("hex"));
    expect(await fs.promises.readFile("/file", "utf8")).toBe("héllo");
    expect(
      await new Promise((resolve, reject) =>
        fs.readFile("/file", "utf8", (err, data) => (err ? reject(err) : resolve(data))),
      ),
    ).toBe("héllo");
    expect(() => fs.readFileSync("/missing")).toThrow(expect.objectContaining({ code: "ENOENT" }));
  });
}
