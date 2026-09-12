import { expect, test } from "vitest";
import { vfs, oracle } from "../helpers/vfs.js";

test("exports the Node VFS namespace and constructor relationships", () => {
  expect(Object.keys(vfs).sort()).toEqual([
    "MemoryProvider",
    "RealFSProvider",
    "VirtualFileSystem",
    "VirtualProvider",
    "create",
  ]);
  expect(new vfs.MemoryProvider()).toBeInstanceOf(vfs.VirtualProvider);
  expect(new vfs.RealFSProvider("/data")).toBeInstanceOf(vfs.VirtualProvider);
  const native = oracle();
  if (native) {
    expect(Object.keys(vfs)).toEqual(Object.keys(native));
  }
});

test("preserves the VirtualFileSystem and promise namespace member sets", () => {
  const native = oracle();
  if (!native) {
    return;
  }
  expect(Object.getOwnPropertyNames(vfs.VirtualFileSystem.prototype).sort()).toEqual(
    Object.getOwnPropertyNames(native.VirtualFileSystem.prototype).sort(),
  );
  expect(Object.keys(vfs.create().promises).sort()).toEqual(
    Object.keys(native.create({ emitExperimentalWarning: false }).promises).sort(),
  );
});
