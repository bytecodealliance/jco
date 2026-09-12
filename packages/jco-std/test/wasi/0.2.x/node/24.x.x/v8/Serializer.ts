import { expect, test } from "vitest";
import native from "node:v8";
import { Buffer } from "node:buffer";
import { v8, blocked, deniedError } from "../helpers/v8.js";

test("writes native headers, scalar primitives and raw view bytes", () => {
  const writer = new v8.Serializer();
  writer.writeHeader();
  writer.writeUint32(0xffffffff);
  writer.writeUint64(0xffffffff, 0xfffffffe);
  writer.writeDouble(-0.25);
  writer.writeRawBytes(new DataView(Uint8Array.from([0, 1, 2, 0]).buffer, 1, 2));
  const reader = new native.Deserializer(writer.releaseBuffer());
  expect(reader.readHeader()).toBe(true);
  expect(reader.readUint32()).toBe(0xffffffff);
  expect(reader.readUint64()).toEqual([0xffffffff, 0xfffffffe]);
  expect(reader.readDouble()).toBe(-0.25);
  expect(reader.readRawBytes(2)).toEqual(Buffer.from([1, 2]));

  writer.writeHeader();
  writer.writeValue(42);
  expect(native.deserialize(writer.releaseBuffer())).toBe(42);
  writer[Symbol.dispose]();
  expect(() => writer.writeHeader()).toThrow(
    expect.objectContaining({ code: "ERR_INVALID_STATE" }),
  );
  expect(() => new blocked.Serializer()).toThrow(expect.objectContaining(deniedError));
});

test("preserves native cross-write references and rolls back a failed graph encode", () => {
  const writer = new v8.Serializer();
  const item = { value: 1 };
  writer.writeHeader();
  writer.writeValue(item);
  item.value = 2;
  expect(() => writer.writeValue({ invalid: () => {} })).toThrow();
  writer.writeValue(item);
  writer.writeValue({ next: item });
  const reader = new native.Deserializer(writer.releaseBuffer());
  reader.readHeader();
  const first = reader.readValue();
  expect(reader.readValue()).toBe(first);
  expect(reader.readValue().next).toBe(first);
  expect(first).toEqual({ value: 1 });
});

test("retains view settings when releaseBuffer permits serializer reuse", () => {
  const writer = new v8.Serializer();
  writer._setTreatArrayBufferViewsAsHostObjects(true);
  writer.releaseBuffer();

  expect(() => writer.writeValue(new Uint8Array([1]))).toThrow();
  writer[Symbol.dispose]();
});
