import { expect, test } from "vitest";
import native from "node:zlib";
import { Buffer } from "node:buffer";
import { zlib } from "../helpers/zlib.js";

const plain = Buffer.from("zlib round trip — ".repeat(100));
const input = plain;

test("brotliCompressSync agrees with Node for views, info and output limits", () => {
  const expected = native.brotliCompressSync(input);
  const padded = Buffer.concat([Buffer.from([255]), input, Buffer.from([255])]);
  for (const value of [input, new DataView(padded.buffer, padded.byteOffset + 1, input.length)]) {
    const actual = zlib.brotliCompressSync(value);
    expect(Buffer.isBuffer(actual)).toBe(true);
    expect(actual).toEqual(expected);
  }

  const result = zlib.brotliCompressSync(input, { info: true });
  expect(result.buffer).toEqual(expected);
  expect(result.engine).toBeInstanceOf(zlib.BrotliCompress);
  expect(result.engine.bytesWritten).toBe(input.length);
  expect(() => zlib.brotliCompressSync(input, { maxOutputLength: 1 })).toThrow(
    expect.objectContaining({ code: "ERR_BUFFER_TOO_LARGE" }),
  );
});

test("brotliCompressSync handles empty and UTF-8 input", () => {
  for (const input of ["", "hello 💚"]) {
    expect(zlib.brotliCompressSync(input)).toEqual(native.brotliCompressSync(input));
  }
});
