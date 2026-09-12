import { expect, test } from "vitest";
import native from "node:v8";
import { Buffer } from "node:buffer";
import { v8, blocked, deniedError } from "../helpers/v8.js";

test("reads native scalar primitives, raw bytes and wire versions", () => {
  const writer = new native.Serializer();
  writer.writeHeader();
  writer.writeUint32(0xffffffff);
  writer.writeUint64(0xffffffff, 0xfffffffe);
  writer.writeDouble(NaN);
  writer.writeRawBytes(Buffer.from("abc"));
  const reader = new v8.Deserializer(writer.releaseBuffer());
  expect(reader.readHeader()).toBe(true);
  expect(reader.getWireFormatVersion()).toBeGreaterThan(0);
  expect(reader.readUint32()).toBe(0xffffffff);
  expect(reader.readUint64()).toEqual([0xffffffff, 0xfffffffe]);
  expect(reader.readDouble()).toBeNaN();
  expect(reader.readRawBytes(3).toString()).toBe("abc");
  expect(() => reader.readRawBytes(1)).toThrow();
  reader[Symbol.dispose]();
  expect(() => reader.readHeader()).toThrow(expect.objectContaining({ code: "ERR_INVALID_STATE" }));
  expect(() => new blocked.Deserializer(Buffer.alloc(0))).toThrow(
    expect.objectContaining(deniedError),
  );
});
