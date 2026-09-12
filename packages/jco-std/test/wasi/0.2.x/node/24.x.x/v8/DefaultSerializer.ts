import { expect, test } from "vitest";
import native from "node:v8";
import { Buffer } from "node:buffer";
import { v8, blocked, deniedError, unsupportedError } from "../helpers/v8.js";

test("preserves Buffer branding and keeps persistent object identities", () => {
  const writer = new v8.DefaultSerializer();
  const value = { buffer: Buffer.from("hi") };
  expect(writer).toBeInstanceOf(v8.Serializer);
  writer.writeHeader();
  writer.writeValue(value);
  writer.writeValue(value);
  const reader = new native.DefaultDeserializer(writer.releaseBuffer());
  reader.readHeader();
  const first = reader.readValue();
  expect(Buffer.isBuffer(first.buffer)).toBe(true);
  expect(reader.readValue()).toBe(first);
  expect(() => new blocked.DefaultSerializer()).toThrow(expect.objectContaining(deniedError));
});

test("custom hooks and transfer registrations fail explicitly", () => {
  const writer = new v8.DefaultSerializer();
  try {
    expect(() => writer.transferArrayBuffer(1, new ArrayBuffer(1))).toThrow(
      expect.objectContaining(unsupportedError),
    );
    writer._writeHostObject = () => {};
    expect(() => writer.writeValue(Buffer.from("x"))).toThrow(
      expect.objectContaining(unsupportedError),
    );
  } finally {
    writer[Symbol.dispose]();
  }
});
