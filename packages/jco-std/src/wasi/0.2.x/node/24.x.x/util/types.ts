// Node.js v24.20.0 lib/internal/util/types.js, commit
// 71b8b174857e25106d39b61a9e6f30d927da8b01 (MIT; see ../util/mime.ts).
// Adapted typed-array getters; native bindings use portable intrinsic brand checks.
// Tag-only checks for arguments, generators and iterators cannot resist tag spoofing.
import { unsupportedNodeApi } from "../errors/core.js";

type TypedArray =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float16Array
  | Float32Array
  | Float64Array
  | BigInt64Array
  | BigUint64Array;

function brand(
  value: unknown,
  intrinsic: ((...args: never[]) => unknown) | undefined,
  args: unknown[] = [],
): boolean {
  if (!intrinsic || value === null || (typeof value !== "object" && typeof value !== "function")) {
    return false;
  }
  try {
    Reflect.apply(intrinsic, value, args);
    return true;
  } catch {
    return false;
  }
}

function getter(prototype: object | undefined, key: PropertyKey): (() => unknown) | undefined {
  return prototype && Object.getOwnPropertyDescriptor(prototype, key)?.get;
}

const typedArrayTag = getter(Object.getPrototypeOf(Uint8Array.prototype), Symbol.toStringTag)!;

function arrayTag(value: unknown): unknown {
  return Reflect.apply(typedArrayTag, value, []);
}

function tag(value: unknown, name: string): boolean {
  return Object.prototype.toString.call(value) === `[object ${name}]`;
}

export const isArrayBufferView: typeof ArrayBuffer.isView = ArrayBuffer.isView;

export function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return brand(value, getter(ArrayBuffer.prototype, "byteLength"));
}

export function isSharedArrayBuffer(value: unknown): value is SharedArrayBuffer {
  return brand(value, getter(globalThis.SharedArrayBuffer?.prototype, "byteLength"));
}

export function isAnyArrayBuffer(value: unknown): value is ArrayBuffer | SharedArrayBuffer {
  return isArrayBuffer(value) || isSharedArrayBuffer(value);
}

export function isDataView(value: unknown): value is DataView {
  return ArrayBuffer.isView(value) && arrayTag(value) === undefined;
}

export function isTypedArray(value: unknown): value is TypedArray {
  return arrayTag(value) !== undefined;
}

export function isInt8Array(value: unknown): value is Int8Array {
  return arrayTag(value) === "Int8Array";
}

export function isUint8Array(value: unknown): value is Uint8Array {
  return arrayTag(value) === "Uint8Array";
}

export function isUint8ClampedArray(value: unknown): value is Uint8ClampedArray {
  return arrayTag(value) === "Uint8ClampedArray";
}

export function isInt16Array(value: unknown): value is Int16Array {
  return arrayTag(value) === "Int16Array";
}

export function isUint16Array(value: unknown): value is Uint16Array {
  return arrayTag(value) === "Uint16Array";
}

export function isInt32Array(value: unknown): value is Int32Array {
  return arrayTag(value) === "Int32Array";
}

export function isUint32Array(value: unknown): value is Uint32Array {
  return arrayTag(value) === "Uint32Array";
}

export function isFloat16Array(value: unknown): value is Float16Array {
  return arrayTag(value) === "Float16Array";
}

export function isFloat32Array(value: unknown): value is Float32Array {
  return arrayTag(value) === "Float32Array";
}

export function isFloat64Array(value: unknown): value is Float64Array {
  return arrayTag(value) === "Float64Array";
}

export function isBigInt64Array(value: unknown): value is BigInt64Array {
  return arrayTag(value) === "BigInt64Array";
}

export function isBigUint64Array(value: unknown): value is BigUint64Array {
  return arrayTag(value) === "BigUint64Array";
}

export function isBooleanObject(value: unknown): value is object & { valueOf(): boolean } {
  return brand(value, Boolean.prototype.valueOf);
}

export function isNumberObject(value: unknown): value is object & { valueOf(): number } {
  return brand(value, Number.prototype.valueOf);
}

export function isStringObject(value: unknown): value is object & { valueOf(): string } {
  return brand(value, String.prototype.valueOf);
}

export function isSymbolObject(value: unknown): value is object & { valueOf(): symbol } {
  return brand(value, Symbol.prototype.valueOf);
}

export function isBigIntObject(value: unknown): value is object & { valueOf(): bigint } {
  return brand(value, BigInt.prototype.valueOf);
}

export function isBoxedPrimitive(
  value: unknown,
): value is object & { valueOf(): boolean | number | string | symbol | bigint } {
  return (
    isBooleanObject(value) ||
    isNumberObject(value) ||
    isStringObject(value) ||
    isSymbolObject(value) ||
    isBigIntObject(value)
  );
}

export function isDate(value: unknown): value is Date {
  return brand(value, Date.prototype.getTime);
}

export function isRegExp(value: unknown): value is RegExp {
  return brand(value, getter(RegExp.prototype, "source"));
}

export function isMap(value: unknown): value is Map<unknown, unknown> {
  return brand(value, getter(Map.prototype, "size"));
}

export function isSet(value: unknown): value is Set<unknown> {
  return brand(value, getter(Set.prototype, "size"));
}

export function isWeakMap(value: unknown): value is WeakMap<object, unknown> {
  return brand(value, WeakMap.prototype.has, [{}]);
}

export function isWeakSet(value: unknown): value is WeakSet<object> {
  return brand(value, WeakSet.prototype.has, [{}]);
}

export function isPromise(value: unknown): value is Promise<unknown> {
  return value instanceof Promise;
}

export function isNativeError(value: unknown): value is Error {
  return typeof Error.isError === "function" ? Error.isError(value) : tag(value, "Error");
}

export function isAsyncFunction(
  value: unknown,
): value is (...args: unknown[]) => Promise<unknown> | AsyncGenerator<unknown> {
  return (
    typeof value === "function" &&
    (tag(value, "AsyncFunction") || tag(value, "AsyncGeneratorFunction"))
  );
}

export function isGeneratorFunction(
  value: unknown,
): value is (...args: unknown[]) => Generator<unknown> | AsyncGenerator<unknown> {
  return (
    typeof value === "function" &&
    (tag(value, "GeneratorFunction") || tag(value, "AsyncGeneratorFunction"))
  );
}

export function isGeneratorObject(
  value: unknown,
): value is Generator<unknown> | AsyncGenerator<unknown> {
  return tag(value, "Generator") || tag(value, "AsyncGenerator");
}

export function isArgumentsObject(value: unknown): value is IArguments {
  return tag(value, "Arguments");
}

export function isMapIterator(value: unknown): value is IterableIterator<unknown> {
  return tag(value, "Map Iterator");
}

export function isSetIterator(value: unknown): value is IterableIterator<unknown> {
  return tag(value, "Set Iterator");
}

export function isModuleNamespaceObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === null &&
    !Object.isExtensible(value) &&
    tag(value, "Module")
  );
}

export function isCryptoKey(value: unknown): value is CryptoKey {
  return brand(value, getter(globalThis.CryptoKey?.prototype, "type"));
}

export function isKeyObject(_value: unknown): never {
  throw unsupportedNodeApi(
    "util.types.isKeyObject",
    "native key objects are not available in components",
  );
}

export function isExternal(_value: unknown): never {
  throw unsupportedNodeApi(
    "util.types.isExternal",
    "native external pointers cannot be inspected in components",
  );
}

export function isProxy(_value: unknown): never {
  throw unsupportedNodeApi("util.types.isProxy", "the engine does not expose proxy targets");
}
