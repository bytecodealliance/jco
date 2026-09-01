import { describe, expect, test, vi } from "vitest";

import * as denyHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/fs-host.js";
import { createFs } from "../../../../../../src/wasi/0.2.x/node/24.x.x/fs/callbacks.js";
import { createFsCore } from "../../../../../../src/wasi/0.2.x/node/24.x.x/fs/core.js";
import { createFsPromises } from "../../../../../../src/wasi/0.2.x/node/24.x.x/fs/promises.js";
import { fs, promises } from "../helpers/fs.js";

describe("node:fs denied and unsupported behavior", () => {
  test("denies host access by default", () => {
    expect(() => denyHost.query("{}")).toThrow(
      expect.objectContaining({ code: "ERR_JCO_FS_ADAPTER_REQUIRED" }),
    );

    const core = createFsCore(denyHost);
    const deniedFs = createFs(core, createFsPromises(core));
    expect(() => deniedFs.existsSync("ignored")).toThrow(
      expect.objectContaining({ code: "ERR_JCO_FS_ADAPTER_REQUIRED" }),
    );
  });

  test.each([
    ["createReadStream", () => fs.createReadStream("ignored")],
    ["createWriteStream", () => fs.createWriteStream("ignored")],
    ["watch", () => fs.watch("ignored")],
    ["watchFile", () => fs.watchFile("ignored")],
    ["openAsBlob", () => fs.openAsBlob("ignored")],
    ["ReadStream", () => new fs.ReadStream("ignored")],
    ["WriteStream", () => new fs.WriteStream("ignored")],
    ["Utf8Stream", () => new fs.Utf8Stream()],
  ])("fails explicitly for unsupported %s", (_name, invoke) => {
    expect(invoke).toThrow(expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }));
  });

  test("deprecated APIs throw before observing arguments", async () => {
    const getter = vi.fn();
    const hostile = Object.defineProperty({}, "toString", { get: getter });
    expect(() => fs.exists(hostile, vi.fn())).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API" }),
    );
    expect(() => fs.lchmod(hostile, 0, vi.fn())).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API" }),
    );
    await expect(promises.lchmod(hostile, 0)).rejects.toMatchObject({
      code: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API",
    });
    expect(getter).not.toHaveBeenCalled();
  });
});
