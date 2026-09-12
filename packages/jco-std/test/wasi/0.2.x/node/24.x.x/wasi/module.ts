import { WASI as NodeWASI } from "node:wasi";
import { describe, expect, test } from "vitest";
import { createWasi } from "../../../../../../src/wasi/0.2.x/node/24.x.x/wasi/core.js";
import { describeDifferential } from "../helpers/assert.js";
import { fakeWasiHost } from "../helpers/wasi.js";

function sortedKeys(value: object): string[] {
  return Reflect.ownKeys(value).map(String).sort();
}

function descriptors(value: object): Record<string, unknown> {
  return Object.fromEntries(
    Reflect.ownKeys(value).map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return [
        String(key),
        descriptor && {
          enumerable: descriptor.enumerable,
          writable: descriptor.writable,
          configurable: descriptor.configurable,
          kind: descriptor.get ? "accessor" : typeof descriptor.value,
        },
      ];
    }),
  );
}

describe("node:wasi module", () => {
  test("exports only the WASI class, enumerable and writable", () => {
    const wasi = createWasi(fakeWasiHost().host);
    expect(sortedKeys(wasi)).toEqual(["WASI"]);
    expect(descriptors(wasi)).toEqual({
      WASI: { enumerable: true, writable: true, configurable: true, kind: "function" },
    });
    expect(wasi.WASI.name).toBe("WASI");
    expect(wasi.WASI.length).toBe(0);
    expect(wasi.WASI.prototype.constructor).toBe(wasi.WASI);
  });

  test("is a class: calling without new throws", () => {
    const { WASI } = createWasi(fakeWasiHost().host);
    expect(() => Reflect.apply(WASI, undefined, [{ version: "preview1" }])).toThrow(TypeError);
  });

  test("has Node's prototype members, non-enumerable, with Node's arities", () => {
    const { WASI } = createWasi(fakeWasiHost().host);
    expect(sortedKeys(WASI.prototype)).toEqual([
      "constructor",
      "finalizeBindings",
      "getImportObject",
      "initialize",
      "start",
    ]);
    expect(descriptors(WASI.prototype)).toEqual(
      Object.fromEntries(
        ["constructor", "finalizeBindings", "getImportObject", "initialize", "start"].map((key) => [
          key,
          { enumerable: false, writable: true, configurable: true, kind: "function" },
        ]),
      ),
    );
    expect(WASI.prototype.start.length).toBe(1);
    expect(WASI.prototype.initialize.length).toBe(1);
    expect(WASI.prototype.finalizeBindings.length).toBe(1);
    expect(WASI.prototype.getImportObject.length).toBe(0);
  });

  test("instances carry wasiImport and Node's five symbol-keyed state slots", () => {
    const { WASI } = createWasi(fakeWasiHost().host);
    const wasi = new WASI({ version: "preview1" });
    expect(Reflect.ownKeys(wasi).map(String)).toEqual([
      "wasiImport",
      "Symbol(kBindingName)",
      "Symbol(kSetMemory)",
      "Symbol(kStarted)",
      "Symbol(kExitCode)",
      "Symbol(kInstance)",
    ]);
    expect(Object.keys(wasi)).toEqual(["wasiImport"]);
    expect(descriptors(wasi).wasiImport).toEqual({
      enumerable: true,
      writable: true,
      configurable: true,
      kind: "object",
    });
  });

  test("touches the provider only when an instance is constructed with valid options", () => {
    const fake = fakeWasiHost();
    const { WASI } = createWasi(fake.host);
    expect(fake.calls).toEqual([]);
    expect(() => new WASI({ version: "nope" })).toThrow();
    expect(fake.calls).toEqual([]);
    new WASI({ version: "preview1" });
    expect(fake.calls).toHaveLength(1);
  });

  test("creates independent modules per provider", () => {
    const a = createWasi(fakeWasiHost().host);
    const b = createWasi(fakeWasiHost().host);
    expect(a.WASI).not.toBe(b.WASI);
    expect(new a.WASI({ version: "preview1" })).not.toBeInstanceOf(b.WASI);
  });
});

describeDifferential("node:wasi module against Node", () => {
  test("matches Node's export keys, descriptors, and prototype shape", () => {
    const wasi = createWasi(fakeWasiHost().host);
    const nodeModule = { WASI: NodeWASI };
    expect(sortedKeys(wasi)).toEqual(sortedKeys(nodeModule));
    expect(sortedKeys(wasi.WASI.prototype)).toEqual(sortedKeys(NodeWASI.prototype));
    expect(descriptors(wasi.WASI.prototype)).toEqual(descriptors(NodeWASI.prototype));
    expect(wasi.WASI.length).toBe(NodeWASI.length);
    for (const method of ["start", "initialize", "getImportObject", "finalizeBindings"] as const) {
      expect(wasi.WASI.prototype[method].length).toBe(NodeWASI.prototype[method].length);
    }
    expect(Reflect.ownKeys(new wasi.WASI({ version: "preview1" })).map(String)).toEqual(
      Reflect.ownKeys(new NodeWASI({ version: "preview1" })).map(String),
    );
  });
});
