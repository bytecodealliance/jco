import { describe, expect, test } from "vitest";

import { createFfi, types } from "../../../../../../src/wasi/0.2.x/node/26.x.x/ffi/index.js";
import type { FfiHost } from "../../../../../../src/wasi/0.2.x/node/26.x.x/ffi/index.js";

/**
 * The `node:ffi` module surface, captured from Node 26.8.1.
 *
 * Recorded rather than diffed live: `node:ffi` does not exist in Node 24, which is what CI runs.
 * Re-capture on a Node 26 build with
 *
 * ```console
 * node --experimental-ffi -e 'console.log(Object.keys(require("node:ffi")).sort().join("\n"))'
 * ```
 *
 * The flag is required; the module is Stability 1 and does not resolve without it.
 */
const NODE_26_EXPORTS = [
  "DynamicLibrary",
  "dlclose",
  "dlopen",
  "dlsym",
  "exportArrayBuffer",
  "exportArrayBufferView",
  "exportBuffer",
  "exportString",
  "getCurrentEventLoop",
  "getFloat32",
  "getFloat64",
  "getInt16",
  "getInt32",
  "getInt64",
  "getInt8",
  "getRawPointer",
  "getUint16",
  "getUint32",
  "getUint64",
  "getUint8",
  "setFloat32",
  "setFloat64",
  "setInt16",
  "setInt32",
  "setInt64",
  "setInt8",
  "setUint16",
  "setUint32",
  "setUint64",
  "setUint8",
  "suffix",
  "toArrayBuffer",
  "toBuffer",
  "toString",
  "types",
];

/** `DynamicLibrary.prototype`, own string keys, from the same capture. */
const NODE_26_PROTOTYPE = [
  "close",
  "constructor",
  "functions",
  "getFunction",
  "getFunctions",
  "getSymbol",
  "getSymbols",
  "refCallback",
  "registerCallback",
  "unrefCallback",
  "unregisterCallback",
];

/** `ffi.types`, from the same capture. */
const NODE_26_TYPES = {
  VOID: "void",
  POINTER: "pointer",
  BUFFER: "buffer",
  ARRAY_BUFFER: "arraybuffer",
  FUNCTION: "function",
  BOOL: "bool",
  CHAR: "char",
  STRING: "string",
  FLOAT: "float",
  DOUBLE: "double",
  INT_8: "int8",
  UINT_8: "uint8",
  INT_16: "int16",
  UINT_16: "uint16",
  INT_32: "int32",
  UINT_32: "uint32",
  INT_64: "int64",
  UINT_64: "uint64",
  FLOAT_32: "float32",
  FLOAT_64: "float64",
};

/** A host that is never called: nothing here invokes the boundary. */
const inertHost = {} as unknown as FfiHost;

describe("node:ffi matches the Node 26 surface", () => {
  test("the factory plus the entry's two data exports cover Node's surface", () => {
    // `suffix` and `types` are added by the entry module rather than the factory: they are
    // specification data, and the entry cannot be imported here because it imports the WIT
    // interface, which only resolves inside a component.
    const built = [...Object.keys(createFfi(inertHost)), "suffix", "types"];
    expect(built.sort()).toEqual([...NODE_26_EXPORTS].sort());
  });

  test("DynamicLibrary.prototype has exactly Node's members", () => {
    const { DynamicLibrary } = createFfi(inertHost);
    expect(Object.getOwnPropertyNames(DynamicLibrary.prototype).sort()).toEqual(
      [...NODE_26_PROTOTYPE].sort(),
    );
  });

  test("DynamicLibrary is disposable, as Node's is", () => {
    const { DynamicLibrary } = createFfi(inertHost);
    expect(typeof DynamicLibrary.prototype[Symbol.dispose]).toBe("function");
  });

  test("functions is an accessor, not a data property", () => {
    // Node exposes it as a getter; a plain property would be a visible difference to anything
    // reading descriptors.
    const { DynamicLibrary } = createFfi(inertHost);
    const descriptor = Object.getOwnPropertyDescriptor(DynamicLibrary.prototype, "functions");
    expect(typeof descriptor?.get).toBe("function");
  });

  test("types matches Node's constant exactly and is frozen", () => {
    expect({ ...types }).toEqual(NODE_26_TYPES);
    expect(Object.isFrozen(types)).toBe(true);
  });
});
