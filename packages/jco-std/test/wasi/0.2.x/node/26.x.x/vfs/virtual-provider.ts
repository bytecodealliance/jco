import { Buffer } from "node:buffer";
import { expect, test } from "vitest";
import { vfs } from "../helpers/vfs.js";
import { VirtualFileHandle } from "../../../../../../src/wasi/0.2.x/node/26.x.x/vfs/file-handle.js";

test("derived provider reads close the supplied handle even on failure", () => {
  let closed = 0;
  let fail = false;
  class Handle extends VirtualFileHandle {
    readFileSync(): Buffer {
      if (fail) {
        throw new Error("read failed");
      }
      return Buffer.from("custom");
    }
    closeSync(): void {
      closed++;
      super.closeSync();
    }
  }
  class Provider extends vfs.VirtualProvider {
    openSync(): VirtualFileHandle {
      return new Handle("/file", "r");
    }
  }
  expect(vfs.create(new Provider()).readFileSync("/file").toString()).toBe("custom");
  expect(closed).toBe(1);
  fail = true;
  expect(() => vfs.create(new Provider()).readFileSync("/file")).toThrow("read failed");
  expect(closed).toBe(2);
  expect(() => new vfs.VirtualProvider().statSync("/x")).toThrow(
    expect.objectContaining({ code: "ERR_METHOD_NOT_IMPLEMENTED" }),
  );
});
