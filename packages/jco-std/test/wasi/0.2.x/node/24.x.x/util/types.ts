import { runInNewContext } from "node:vm";
import { describe, expect } from "vitest";
import { util, native, test } from "../helpers/util.js";

function checkBrands(name: keyof typeof util.types, positive: unknown[]): void {
  for (const value of [
    ...positive,
    null,
    undefined,
    0,
    false,
    "x",
    1n,
    Symbol(),
    {},
    [],
    () => {},
  ]) {
    expect(util.types[name](value)).toBe(native.types[name](value));
  }
}

describe("util.types", () => {
  test("types.isAnyArrayBuffer agrees with Node for brands and primitive negatives", () => {
    const positive: unknown[] = [new ArrayBuffer(1), new SharedArrayBuffer(1)];
    checkBrands("isAnyArrayBuffer", positive);
  });

  test("types.isArgumentsObject agrees with Node for brands and primitive negatives", () => {
    const positive: unknown[] = [runInNewContext("(function () { return arguments; })(1, 2)")];
    checkBrands("isArgumentsObject", positive);
  });

  test("types.isArrayBuffer agrees with Node for brands and primitive negatives", () => {
    const positive: unknown[] = [new ArrayBuffer(1)];
    checkBrands("isArrayBuffer", positive);
  });

  test("types.isArrayBufferView agrees with Node for brands and primitive negatives", () => {
    const positive: unknown[] = [new DataView(new ArrayBuffer(1)), new Uint8Array(1)];
    checkBrands("isArrayBufferView", positive);
  });

  test("types.isAsyncFunction agrees with Node for brands and primitive negatives", () => {
    const positive: unknown[] = [async function f() {}];
    checkBrands("isAsyncFunction", positive);
  });

  test("isAsyncFunction recognizes async generators", () => {
    const value = async function* (): AsyncGenerator<number> {
      yield 1;
    };

    expect(util.types.isAsyncFunction(value)).toBe(native.types.isAsyncFunction(value));
  });

  test("types.isBigInt64Array agrees with Node for brands and primitive negatives", () => {
    const positive: unknown[] = [new BigInt64Array(1)];
    checkBrands("isBigInt64Array", positive);
  });

  test("types.isBigIntObject agrees with Node for brands and primitive negatives", () => {
    const positive: unknown[] = [Object(1n)];
    checkBrands("isBigIntObject", positive);
  });

  test("types.isBigUint64Array agrees with Node for brands and primitive negatives", () => {
    const positive: unknown[] = [new BigUint64Array(1)];
    checkBrands("isBigUint64Array", positive);
  });

  test("types.isBooleanObject agrees with Node for brands and primitive negatives", () => {
    const positive: unknown[] = [Object(true)];
    checkBrands("isBooleanObject", positive);
  });

  test("types.isBoxedPrimitive agrees with Node for brands and primitive negatives", () => {
    const positive: unknown[] = [
      Object(1),
      Object("x"),
      Object(true),
      Object(1n),
      Object(Symbol()),
    ];
    checkBrands("isBoxedPrimitive", positive);
  });

  test("types.isCryptoKey checks engine key slots", async () => {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 128 }, true, [
      "encrypt",
    ]);
    for (const value of [key, {}, null, { [Symbol.toStringTag]: "CryptoKey" }]) {
      expect(util.types.isCryptoKey(value)).toBe(native.types.isCryptoKey(value));
    }
  });

  test("types.isDataView agrees with Node for brands and primitive negatives", () => {
    const positive: unknown[] = [new DataView(new ArrayBuffer(1))];
    checkBrands("isDataView", positive);
  });

  test("types.isDate agrees with Node for brands and primitive negatives", () => {
    const positive: unknown[] = [new Date(), new Date(NaN)];
    checkBrands("isDate", positive);
  });

  test("types.isExternal refuses inaccessible native state without reflection", () => {
    const value = new Proxy(
      {},
      {
        get() {
          throw Error("getter");
        },

        getPrototypeOf() {
          throw Error("prototype");
        },
      },
    );
    expect(() => util.types.isExternal(value)).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
    );
  });

  test("types.isFloat16Array agrees with Node for brands and primitive negatives", () => {
    const positive: unknown[] = [new Float16Array(1)];
    checkBrands("isFloat16Array", positive);
  });

  test("types.isFloat32Array agrees with Node for brands and primitive negatives", () => {
    const positive: unknown[] = [new Float32Array(1)];
    checkBrands("isFloat32Array", positive);
  });

  test("types.isFloat64Array agrees with Node for brands and primitive negatives", () => {
    const positive: unknown[] = [new Float64Array(1)];
    checkBrands("isFloat64Array", positive);
  });

  test("types.isGeneratorFunction agrees with Node for brands and primitive negatives", () => {
    const positive: unknown[] = [function* g() {}, async function* g() {}];
    checkBrands("isGeneratorFunction", positive);
  });

  test("types.isGeneratorObject agrees with Node for brands and primitive negatives", () => {
    const positive: unknown[] = [(function* g() {})(), (async function* g() {})()];
    checkBrands("isGeneratorObject", positive);
  });

  test("types.isInt16Array agrees with Node for brands and primitive negatives", () => {
    const positive: unknown[] = [new Int16Array(1)];
    checkBrands("isInt16Array", positive);
  });

  test("types.isInt32Array agrees with Node for brands and primitive negatives", () => {
    const positive: unknown[] = [new Int32Array(1)];
    checkBrands("isInt32Array", positive);
  });

  test("types.isInt8Array agrees with Node for brands and primitive negatives", () => {
    const positive: unknown[] = [new Int8Array(1)];
    checkBrands("isInt8Array", positive);
  });

  test("types.isKeyObject refuses inaccessible native state without reflection", () => {
    const value = new Proxy(
      {},
      {
        get() {
          throw Error("getter");
        },

        getPrototypeOf() {
          throw Error("prototype");
        },
      },
    );
    expect(() => util.types.isKeyObject(value)).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
    );
  });

  test("types.isMap agrees with Node for brands and primitive negatives", () => {
    const positive: unknown[] = [new Map()];
    checkBrands("isMap", positive);
  });

  test("types.isMapIterator agrees with Node for brands and primitive negatives", () => {
    const positive: unknown[] = [new Map().entries(), new Map().keys()];
    checkBrands("isMapIterator", positive);
  });

  test("types.isModuleNamespaceObject recognizes native namespace shape", async () => {
    const url = "data:text/javascript,export const value = 1";
    const namespace: unknown = await import(/* @vite-ignore */ url);
    for (const value of [namespace, null, {}, { [Symbol.toStringTag]: "Module" }]) {
      expect(util.types.isModuleNamespaceObject(value)).toBe(
        native.types.isModuleNamespaceObject(value),
      );
    }
  });

  test("types.isNativeError agrees with Node for brands and primitive negatives", () => {
    const positive: unknown[] = [new Error("x"), new TypeError("x")];
    checkBrands("isNativeError", positive);
  });

  test("types.isNumberObject agrees with Node for brands and primitive negatives", () => {
    const positive: unknown[] = [Object(1)];
    checkBrands("isNumberObject", positive);
  });

  test("types.isPromise agrees with Node for brands and primitive negatives", () => {
    const positive: unknown[] = [Promise.resolve(1)];
    checkBrands("isPromise", positive);
  });

  test("types.isProxy refuses inaccessible native state without reflection", () => {
    const value = new Proxy(
      {},
      {
        get() {
          throw Error("getter");
        },

        getPrototypeOf() {
          throw Error("prototype");
        },
      },
    );
    expect(() => util.types.isProxy(value)).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
    );
  });

  test("types.isRegExp agrees with Node for brands and primitive negatives", () => {
    const positive: unknown[] = [/x/g];
    checkBrands("isRegExp", positive);
  });

  test("types.isSet agrees with Node for brands and primitive negatives", () => {
    const positive: unknown[] = [new Set()];
    checkBrands("isSet", positive);
  });

  test("types.isSetIterator agrees with Node for brands and primitive negatives", () => {
    const positive: unknown[] = [new Set().values(), new Set().entries()];
    checkBrands("isSetIterator", positive);
  });

  test("types.isSharedArrayBuffer agrees with Node for brands and primitive negatives", () => {
    const positive: unknown[] = [new SharedArrayBuffer(1)];
    checkBrands("isSharedArrayBuffer", positive);
  });

  test("types.isStringObject agrees with Node for brands and primitive negatives", () => {
    const positive: unknown[] = [Object("x")];
    checkBrands("isStringObject", positive);
  });

  test("types.isSymbolObject agrees with Node for brands and primitive negatives", () => {
    const positive: unknown[] = [Object(Symbol("x"))];
    checkBrands("isSymbolObject", positive);
  });

  test("types.isTypedArray agrees with Node for brands and primitive negatives", () => {
    const positive: unknown[] = [new Uint8Array(1), new BigInt64Array(1)];
    checkBrands("isTypedArray", positive);
  });

  test("types.isUint16Array agrees with Node for brands and primitive negatives", () => {
    const positive: unknown[] = [new Uint16Array(1)];
    checkBrands("isUint16Array", positive);
  });

  test("types.isUint32Array agrees with Node for brands and primitive negatives", () => {
    const positive: unknown[] = [new Uint32Array(1)];
    checkBrands("isUint32Array", positive);
  });

  test("types.isUint8Array agrees with Node for brands and primitive negatives", () => {
    const positive: unknown[] = [new Uint8Array(1)];
    checkBrands("isUint8Array", positive);
  });

  test("types.isUint8ClampedArray agrees with Node for brands and primitive negatives", () => {
    const positive: unknown[] = [new Uint8ClampedArray(1)];
    checkBrands("isUint8ClampedArray", positive);
  });

  test("types.isWeakMap agrees with Node for brands and primitive negatives", () => {
    const positive: unknown[] = [new WeakMap()];
    checkBrands("isWeakMap", positive);
  });

  test("types.isWeakSet agrees with Node for brands and primitive negatives", () => {
    const positive: unknown[] = [new WeakSet()];
    checkBrands("isWeakSet", positive);
  });
});
