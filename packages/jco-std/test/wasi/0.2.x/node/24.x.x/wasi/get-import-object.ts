import { WASI as NodeWASI } from "node:wasi";
import { describe, expect, test } from "vitest";
import { createWasi } from "../../../../../../src/wasi/0.2.x/node/24.x.x/wasi/core.js";
import { describeDifferential } from "../helpers/assert.js";
import { fakeWasiHost } from "../helpers/wasi.js";

describe("wasi.getImportObject()", () => {
  test("namespaces wasiImport by the requested snapshot", () => {
    const { WASI } = createWasi(fakeWasiHost().host);
    const preview1 = new WASI({ version: "preview1" });
    expect(Object.keys(preview1.getImportObject())).toEqual(["wasi_snapshot_preview1"]);
    expect(preview1.getImportObject().wasi_snapshot_preview1).toBe(preview1.wasiImport);
    const unstable = new WASI({ version: "unstable" });
    expect(Object.keys(unstable.getImportObject())).toEqual(["wasi_unstable"]);
    expect(unstable.getImportObject().wasi_unstable).toBe(unstable.wasiImport);
  });

  test("returns a fresh wrapper each call around the same table", () => {
    const fake = fakeWasiHost();
    const { WASI } = createWasi(fake.host);
    const wasi = new WASI({ version: "preview1" });
    const first = wasi.getImportObject();
    expect(wasi.getImportObject()).not.toBe(first);
    expect(wasi.getImportObject()).toEqual(first);
    expect(fake.calls).toHaveLength(1);
  });
});

describeDifferential("wasi.getImportObject() against Node", () => {
  test("uses Node's namespace per version", () => {
    const { WASI } = createWasi(fakeWasiHost().host);
    for (const version of ["preview1", "unstable"]) {
      expect(Object.keys(new WASI({ version }).getImportObject())).toEqual(
        Object.keys(new NodeWASI({ version }).getImportObject()),
      );
    }
  });
});
