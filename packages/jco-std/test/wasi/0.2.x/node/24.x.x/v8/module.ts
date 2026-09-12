import { expect, test } from "vitest";
import native from "node:v8";
import { v8 } from "../helpers/v8.js";

test("matches Node 24.20.0 exports and class inheritance", () => {
  expect(process.version).toBe("v24.20.0");
  expect(Object.keys(v8).sort()).toEqual(Object.keys(native).sort());
  expect(Object.keys(v8.promiseHooks)).toEqual(Object.keys(native.promiseHooks));
  expect(Object.keys(v8.startupSnapshot)).toEqual(Object.keys(native.startupSnapshot));
  expect(Object.getPrototypeOf(v8.DefaultSerializer)).toBe(v8.Serializer);
  expect(Object.getPrototypeOf(v8.DefaultDeserializer)).toBe(v8.Deserializer);
  expect(Reflect.apply(v8.startupSnapshot.isBuildingSnapshot, null, [])).toBe(false);
});

test("importing and guest-only unsupported APIs never consult the host", async () => {
  const { createV8 } = await import("../../../../../../src/wasi/0.2.x/node/24.x.x/v8/core.js");
  const denied = await import("../../../../../../src/wasi/0.2.x/node/24.x.x/v8-host.js");
  let accesses = 0;
  const host = new Proxy(denied.default, {
    get() {
      accesses++;
      throw new Error("unexpected host access");
    },
  });
  const local = createV8(host);

  expect(local.startupSnapshot.isBuildingSnapshot()).toBe(false);
  expect(new local.GCProfiler().stop()).toBeUndefined();
  expect(() => local.queryObjects(Object)).toThrow(/not supported/);
  expect(accesses).toBe(0);

  for (const Constructor of [denied.Writer, denied.Reader, denied.Profile]) {
    expect(() => new Constructor()).toThrow(
      expect.objectContaining({ code: "ERR_JCO_V8_ADAPTER_REQUIRED" }),
    );

    const resource = Object.create(Constructor.prototype);

    for (const name of Object.getOwnPropertyNames(Constructor.prototype)) {
      if (name !== "constructor") {
        expect(() => Reflect.apply(resource[name], resource, [])).toThrow(
          expect.objectContaining({ code: "ERR_JCO_V8_ADAPTER_REQUIRED" }),
        );
      }
    }
  }
});

test("matches native constructor prototype names and descriptors", () => {
  for (const name of [
    "Serializer",
    "Deserializer",
    "DefaultSerializer",
    "DefaultDeserializer",
    "GCProfiler",
  ] as const) {
    const actual = Object.getOwnPropertyDescriptors(v8[name].prototype);
    const expected = Object.getOwnPropertyDescriptors(native[name].prototype);

    expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());

    for (const key of Object.keys(expected)) {
      expect(actual[key]).toMatchObject({
        enumerable: expected[key].enumerable,
        configurable: expected[key].configurable,
        writable: expected[key].writable,
      });
    }
  }
});
