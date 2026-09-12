import { expect, test } from "vitest";
import {
  createMessageCodec,
  decodeMessage,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/worker-threads/codec.js";

test("messages preserve cycles, aliasing, special primitives and structured containers", () => {
  const codec = createMessageCodec();
  const shared = { value: 3 };
  const value: Record<string, unknown> = {
    shared,
    again: shared,
    undef: undefined,
    large: 2n ** 90n,
    minusZero: -0,
    nan: NaN,
    map: new Map([[shared, new Set([shared])]]),
    date: new Date(123),
    bytes: new Uint8Array([1, 2]).buffer,
  };
  value.self = value;
  const result = decodeMessage(codec.encode(value));
  expect(result).toEqual(structuredClone(value));
  const record = result as typeof value;
  expect(record.self).toBe(record);
  expect(record.again).toBe(record.shared);
  expect(Object.is(record.minusZero, -0)).toBe(true);
});

test("unsupported messages never run toJSON or accessors and cannot pollute prototypes", () => {
  const codec = createMessageCodec();
  let called = false;
  expect(() =>
    codec.encode({
      get field() {
        called = true;
        return 1;
      },
    }),
  ).toThrow(/Accessor/);
  expect(() =>
    codec.encode({
      toJSON() {
        called = true;
        return 1;
      },
    }),
  ).toThrow(/clone/);
  expect(called).toBe(false);
  const value = JSON.parse('{"__proto__":{"polluted":true}}');
  const clone = decodeMessage(codec.encode(value)) as object;
  expect(Object.getPrototypeOf(clone)).toBe(Object.prototype);
  expect(Object.hasOwn(clone, "__proto__")).toBe(true);
  expect(() => codec.encode(new SharedArrayBuffer(2))).toThrow(/Only plain/);
});

test("typed views preserve buffer aliasing and offsets, while RegExp resets lastIndex", () => {
  const buffer = new ArrayBuffer(16);
  const words = new Int16Array(buffer, 4, 3);
  words.set([-2, 4, 8]);
  const regex = /ab/gi;
  regex.lastIndex = 2;
  const value = { buffer, words, view: new DataView(buffer, 2, 8), regex };
  const result = decodeMessage(createMessageCodec().encode(value)) as typeof value;
  expect(result).toEqual(structuredClone(value));
  expect(result.words.buffer).toBe(result.buffer);
  expect(result.view.buffer).toBe(result.buffer);
  expect(result.regex.lastIndex).toBe(0);
});
