import { expect, test } from "vitest";
import native from "node:v8";
import { Buffer } from "node:buffer";
import { v8, blocked, deniedError, unsupportedError } from "../helpers/v8.js";

test("preserves reference identity across readValue calls", () => {
  const writer = new native.DefaultSerializer();
  const value = { buffer: Buffer.from("hi") };
  writer.writeHeader();
  writer.writeValue(value);
  writer.writeValue(value);
  const reader = new v8.DefaultDeserializer(writer.releaseBuffer());
  try {
    expect(reader).toBeInstanceOf(v8.Deserializer);
    reader.readHeader();
    const first = reader.readValue();
    expect(reader.readValue()).toBe(first);
    expect(first).toEqual(value);
    expect(() => reader.transferArrayBuffer(1, new ArrayBuffer(1))).toThrow(
      expect.objectContaining(unsupportedError),
    );
  } finally {
    reader[Symbol.dispose]();
  }

  expect(() => new blocked.DefaultDeserializer(Buffer.alloc(0))).toThrow(
    expect.objectContaining(deniedError),
  );
});
