import { expect, test } from "vitest";
import { Buffer } from "node:buffer";
import {
  createMessageCodec,
  decodeMessage,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/internal/structured-value.js";

test("worker defaults retain buffer sharing, sparse arrays, safe keys and special values", () => {
  const backing = new ArrayBuffer(16);
  const array = new Array(4);
  array[2] = "present";
  const source = {
    backing,
    first: new Uint16Array(backing, 2, 2),
    second: new DataView(backing, 3, 3),
    buffer: Buffer.from("hello"),
    array,
    numbers: [-0, NaN, Infinity, -Infinity],
    record: JSON.parse('{"__proto__":{"value":1}}'),
  };
  const result = decodeMessage(createMessageCodec().encode(source)) as typeof source;

  expect(result.first.buffer).toBe(result.backing);
  expect(result.second.buffer).toBe(result.backing);
  expect(result.first.byteOffset).toBe(2);
  expect(result.second.byteOffset).toBe(3);
  expect(result.buffer).toBeInstanceOf(Uint8Array);
  expect(Buffer.isBuffer(result.buffer)).toBe(false);
  expect(result.array).toEqual(array);
  expect(0 in result.array).toBe(false);
  expect(result.numbers).toEqual(source.numbers);
  expect(Object.getPrototypeOf(result.record)).toBe(Object.prototype);
  expect(Object.hasOwn(result.record, "__proto__")).toBe(true);
});

test("persistent graphs keep identities and recover from an unsupported nested value", () => {
  const codec = createMessageCodec({ persistent: true, preserveBuffers: true });
  const session = { values: [] as unknown[] };
  const item = { buffer: Buffer.from("hi") };
  const first = decodeMessage(codec.encode(item), session);

  expect(() => codec.encode({ nested: { invalid: Symbol() } })).toThrow();
  expect(decodeMessage(codec.encode(item), session)).toBe(first);
  expect(decodeMessage(codec.encode({ item }), session)).toEqual({ item: first });
  expect(Buffer.isBuffer((first as typeof item).buffer)).toBe(true);
});
