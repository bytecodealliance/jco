import { expect, test } from "vitest";
import native from "node:zlib";
import { createZlib } from "../../../../../src/wasi/0.2.x/node/24.x.x/zlib/core.js";
import denied, { Engine } from "../../../../../src/wasi/0.2.x/node/24.x.x/zlib-host.js";
import { zlib } from "../helpers/zlib.js";

test("complete modern export shape, descriptors and no implicit capability", () => {
  expect(process.version).toBe("v24.20.0");
  expect(Object.keys(zlib).sort()).toEqual(Object.keys(native).sort());
  expect(Object.getOwnPropertyNames(zlib).sort()).toEqual(
    Object.getOwnPropertyNames(native).sort(),
  );
  expect(zlib.constants).toEqual(native.constants);
  expect(zlib.codes).toEqual(Reflect.get(native, "codes"));
  expect(Object.getOwnPropertyDescriptor(zlib, "createGzip")?.writable).toBe(false);
  expect(Object.getOwnPropertyDescriptor(zlib, "constants")?.configurable).toBe(false);
  expect(Object.getPrototypeOf(zlib.constants)).toBe(null);
  expect(Object.isFrozen(zlib.codes)).toBe(true);
  const blocked = createZlib(denied);
  expect(blocked.constants.Z_OK).toBe(0);
  expect(() => blocked.gzipSync("data")).toThrow(
    expect.objectContaining({ code: "ERR_JCO_ZLIB_ADAPTER_REQUIRED" }),
  );
  expect(() => blocked.Gzip()).toThrow(
    expect.objectContaining({ code: "ERR_JCO_ZLIB_ADAPTER_REQUIRED" }),
  );
  expect(() => blocked.crc32("data")).toThrow(
    expect.objectContaining({ code: "ERR_JCO_ZLIB_ADAPTER_REQUIRED" }),
  );
  expect(() =>
    blocked.gzip("data", (): void => {
      throw new Error("callback must not run");
    }),
  ).toThrow(expect.objectContaining({ code: "ERR_JCO_ZLIB_ADAPTER_REQUIRED" }));
  expect(() => new Engine()).toThrow();
});
test("deprecated accessors fail before consulting the receiver", () => {
  expect(() => Reflect.get(zlib, "Z_OK")).toThrow(/deprecated/);
  const stream = zlib.Gzip();
  try {
    expect(() => stream.bytesRead).toThrow(/deprecated/);
    expect(stream.constructor).toBe(zlib.Gzip);
  } finally {
    stream.close();
  }
});

test("deny provider refuses every resource operation", () => {
  const resource = Object.create(Engine.prototype) as Engine;
  for (const operation of [
    (): unknown => resource.write(new Uint8Array()),
    (): unknown => resource.finish(),
    (): unknown => resource.flush(0),
    (): unknown => resource.params(1, 0),
    (): unknown => resource.reset(),
    (): unknown => resource.close(),
  ]) {
    expect(operation).toThrow(expect.objectContaining({ code: "ERR_JCO_ZLIB_ADAPTER_REQUIRED" }));
  }
});
