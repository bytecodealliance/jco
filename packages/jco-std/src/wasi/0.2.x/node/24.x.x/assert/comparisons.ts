// Adapted from Node.js lib/internal/util/comparisons.js at v24.19.0, commit
// cdc1b38d40cb567b7ad0b39c86addf830a0af0ae:
// https://github.com/nodejs/node/blob/cdc1b38d40cb567b7ad0b39c86addf830a0af0ae/lib/internal/util/comparisons.js
// Node.js is MIT licensed (https://github.com/nodejs/node/blob/v24.19.0/LICENSE).
// Node internal brand checks and buffer bindings are replaced with portable JS,
// and the comparison state and public entry points are converted to TypeScript.

type Mode = "loose" | "strict" | "strict-no-prototype" | "partial";

interface Memo {
  left: Map<object, object>;
  right: Map<object, object>;
}

type Primitive = null | undefined | string | number | bigint | boolean | symbol;

const toString = Object.prototype.toString;
const enumerable = Object.prototype.propertyIsEnumerable;

function tag(value: object): string {
  return toString.call(value);
}

function ownKeys(value: object, mode: Mode): PropertyKey[] {
  const keys: PropertyKey[] = Object.keys(value);
  if (mode !== "loose") {
    for (const symbol of Object.getOwnPropertySymbols(value)) {
      if (enumerable.call(value, symbol)) {
        keys.push(symbol);
      }
    }
  }
  return keys;
}

function isSharedArrayBuffer(value: object): value is SharedArrayBuffer {
  return typeof SharedArrayBuffer !== "undefined" && value instanceof SharedArrayBuffer;
}

function bytes(value: ArrayBufferLike | ArrayBufferView): Uint8Array {
  if (value instanceof ArrayBuffer || isSharedArrayBuffer(value)) {
    return new Uint8Array(value);
  }
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function isFloatArray(value: ArrayBufferView): value is Float32Array | Float64Array {
  return value instanceof Float32Array || value instanceof Float64Array;
}

function looseFloatArraysEqual(
  left: Float32Array | Float64Array,
  right: Float32Array | Float64Array,
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) {
      return false;
    }
  }
  return true;
}

function bytesEqual(left: Uint8Array, right: Uint8Array, partial: boolean): boolean {
  if (!partial) {
    if (left.byteLength !== right.byteLength) {
      return false;
    }
    for (let i = 0; i < left.byteLength; i++) {
      if (left[i] !== right[i]) {
        return false;
      }
    }
    return true;
  }
  if (left.byteLength < right.byteLength) {
    return false;
  }
  let leftIndex = 0;
  for (const byte of right) {
    while (leftIndex < left.length && left[leftIndex] !== byte) {
      leftIndex++;
    }
    if (leftIndex === left.length) {
      return false;
    }
    leftIndex++;
  }
  return true;
}

function boxedValue(value: object): unknown {
  switch (tag(value)) {
    case "[object Number]":
      return Number.prototype.valueOf.call(value);
    case "[object String]":
      return String.prototype.valueOf.call(value);
    case "[object Boolean]":
      return Boolean.prototype.valueOf.call(value);
    case "[object BigInt]":
      return BigInt.prototype.valueOf.call(value);
    case "[object Symbol]":
      return Symbol.prototype.valueOf.call(value);
    default:
      return undefined;
  }
}

function enumerablePropertiesEqual(left: object, right: object, mode: Mode, memo: Memo): boolean {
  const leftRecord = left as Record<PropertyKey, unknown>;
  const rightRecord = right as Record<PropertyKey, unknown>;
  const leftKeys = ownKeys(left, mode);
  const rightKeys = ownKeys(right, mode);
  if (mode === "partial") {
    for (const key of rightKeys) {
      if (
        !enumerable.call(left, key) ||
        !innerEqual(leftRecord[key], rightRecord[key], mode, memo)
      ) {
        return false;
      }
    }
    return true;
  }
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (
      !enumerable.call(right, key) ||
      !innerEqual(leftRecord[key], rightRecord[key], mode, memo)
    ) {
      return false;
    }
  }
  return true;
}

function unorderedSubset(
  left: unknown[],
  right: unknown[],
  mode: Mode,
  memo: Memo,
  compare: (a: unknown, b: unknown, memo: Memo) => boolean = (a, b, state) =>
    innerEqual(a, b, mode, state),
): boolean {
  if (mode === "partial" ? left.length < right.length : left.length !== right.length) {
    return false;
  }
  const used = new Set<number>();
  const search = (index: number, state: Memo): boolean => {
    if (index === right.length) {
      return true;
    }
    for (let i = 0; i < left.length; i++) {
      if (used.has(i)) {
        continue;
      }
      const next: Memo = { left: new Map(state.left), right: new Map(state.right) };
      if (compare(left[i], right[index], next)) {
        used.add(i);
        if (search(index + 1, next)) {
          return true;
        }
        used.delete(i);
      }
    }
    return false;
  };
  return search(0, memo);
}

function compareArrays(left: unknown[], right: unknown[], mode: Mode, memo: Memo): boolean {
  if (mode !== "partial") {
    if (left.length !== right.length) {
      return false;
    }
    for (let i = 0; i < left.length; i++) {
      if (Object.hasOwn(left, i) !== Object.hasOwn(right, i)) {
        return false;
      }
      if (Object.hasOwn(left, i) && !innerEqual(left[i], right[i], mode, memo)) {
        return false;
      }
    }
  } else {
    if (left.length < right.length) {
      return false;
    }
    let position = 0;
    for (let i = 0; i < left.length && position < right.length; i++) {
      const next: Memo = { left: new Map(memo.left), right: new Map(memo.right) };
      if (innerEqual(left[i], right[position], mode, next)) {
        position++;
      }
    }
    if (position !== right.length) {
      return false;
    }
  }
  const isArrayIndex = (key: PropertyKey): boolean => {
    if (typeof key !== "string") {
      return false;
    }
    const index = Number(key);
    return Number.isInteger(index) && index >= 0 && index < 0xffff_ffff && String(index) === key;
  };
  const extras = (value: unknown[]): object => {
    const record = value as unknown as Record<PropertyKey, unknown>;
    const result: Record<PropertyKey, unknown> = {};
    for (const key of ownKeys(value, mode)) {
      if (!isArrayIndex(key)) {
        result[key] = record[key];
      }
    }
    return result;
  };
  const leftObject = extras(left);
  const rightObject = extras(right);
  return enumerablePropertiesEqual(leftObject, rightObject, mode, memo);
}

function compareErrors(left: Error, right: Error, mode: Mode, memo: Memo): boolean {
  const leftRecord = left as unknown as Record<PropertyKey, unknown>;
  const rightRecord = right as unknown as Record<PropertyKey, unknown>;
  for (const key of ["name", "message", "cause", "errors"] as const) {
    const leftHas = key in left;
    const rightHas = key in right;
    if (mode === "partial" && !rightHas) {
      continue;
    }
    if (leftHas !== rightHas || !innerEqual(leftRecord[key], rightRecord[key], mode, memo)) {
      return false;
    }
  }
  return enumerablePropertiesEqual(left, right, mode, memo);
}

function compareObjects(left: object, right: object, mode: Mode, memo: Memo): boolean {
  if (mode === "strict" && Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) {
    return false;
  }

  const mappedRight = memo.left.get(left);
  if (mappedRight !== undefined) {
    return mappedRight === right;
  }
  if (memo.right.has(right)) {
    return false;
  }
  memo.left.set(left, right);
  memo.right.set(right, left);

  const leftTag = tag(left);
  const rightTag = tag(right);
  if (leftTag !== rightTag) {
    return false;
  }

  if (Array.isArray(left)) {
    return compareArrays(left, right as unknown[], mode, memo);
  }
  if (left instanceof Date) {
    const a = left.getTime();
    const b = (right as Date).getTime();
    if (a !== b && !(Number.isNaN(a) && Number.isNaN(b))) {
      return false;
    }
  } else if (left instanceof RegExp) {
    const other = right as RegExp;
    if (
      left.source !== other.source ||
      left.flags !== other.flags ||
      left.lastIndex !== other.lastIndex
    ) {
      return false;
    }
  } else if (left instanceof ArrayBuffer || isSharedArrayBuffer(left)) {
    if (!(right instanceof ArrayBuffer || isSharedArrayBuffer(right))) {
      return false;
    }
    if (!bytesEqual(bytes(left), bytes(right), mode === "partial")) {
      return false;
    }
  } else if (ArrayBuffer.isView(left)) {
    if (!ArrayBuffer.isView(right) || left.constructor !== right.constructor) {
      return false;
    }
    if (
      mode === "loose" &&
      isFloatArray(left) &&
      isFloatArray(right) &&
      left.constructor === right.constructor
    ) {
      if (!looseFloatArraysEqual(left, right)) {
        return false;
      }
    } else if (!bytesEqual(bytes(left), bytes(right), mode === "partial")) {
      return false;
    }
  } else if (left instanceof Set) {
    if (!(right instanceof Set) || !unorderedSubset([...left], [...right], mode, memo)) {
      return false;
    }
  } else if (left instanceof Map) {
    if (!(right instanceof Map)) {
      return false;
    }
    const compareEntry = (a: unknown, b: unknown, state: Memo) => {
      const leftEntry = a as [unknown, unknown];
      const rightEntry = b as [unknown, unknown];
      return (
        innerEqual(leftEntry[0], rightEntry[0], mode, state) &&
        innerEqual(leftEntry[1], rightEntry[1], mode, state)
      );
    };
    if (!unorderedSubset([...left], [...right], mode, memo, compareEntry)) {
      return false;
    }
  } else if (left instanceof Error) {
    if (!(right instanceof Error) || !compareErrors(left, right, mode, memo)) {
      return false;
    }
    return true;
  } else if (left instanceof WeakMap || left instanceof WeakSet || left instanceof Promise) {
    return false;
  } else if (typeof URL !== "undefined" && left instanceof URL) {
    if (!(right instanceof URL) || left.href !== right.href) {
      return false;
    }
  } else {
    const boxed = boxedValue(left);
    if (
      boxed !== undefined ||
      ["[object Number]", "[object String]", "[object Boolean]"].includes(leftTag)
    ) {
      if (!Object.is(boxed, boxedValue(right))) {
        return false;
      }
    }
  }

  return enumerablePropertiesEqual(left, right, mode, memo);
}

function innerEqual(left: unknown, right: unknown, mode: Mode, memo: Memo): boolean {
  if (left === right) {
    return left !== 0 || Object.is(left, right) || mode === "loose";
  }
  if (mode === "loose") {
    if (
      (left === null || typeof left !== "object") &&
      (right === null || typeof right !== "object")
    ) {
      // This coercive comparison is required by Node's legacy deepEqual mode.
      // eslint-disable-next-line eqeqeq
      return (
        (left as Primitive) == (right as Primitive) || (Number.isNaN(left) && Number.isNaN(right))
      );
    }
  } else if (
    typeof left === "number" &&
    Number.isNaN(left) &&
    typeof right === "number" &&
    Number.isNaN(right)
  ) {
    return true;
  }
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") {
    return false;
  }
  return compareObjects(left, right, mode, memo);
}

function compare(left: unknown, right: unknown, mode: Mode): boolean {
  return innerEqual(left, right, mode, { left: new Map(), right: new Map() });
}

export function isDeepEqual(left: unknown, right: unknown): boolean {
  return compare(left, right, "loose");
}

export function isDeepStrictEqual(left: unknown, right: unknown, skipPrototype = false): boolean {
  return compare(left, right, skipPrototype ? "strict-no-prototype" : "strict");
}

export function isPartialStrictEqual(left: unknown, right: unknown): boolean {
  return compare(left, right, "partial");
}
