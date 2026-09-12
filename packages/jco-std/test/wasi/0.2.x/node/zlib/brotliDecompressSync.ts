import { expect, test } from "vitest";
import native from "node:zlib";
import { Buffer } from "node:buffer";
import { zlib } from "../helpers/zlib.js";
const plain = Buffer.from("zlib round trip — ".repeat(100));
const input = native.brotliCompressSync(plain);

test("brotliDecompressSync agrees with Node for views, info and output limits", () => {
  const expected = native.brotliDecompressSync(input);
  const padded = Buffer.concat([Buffer.from([255]), input, Buffer.from([255])]);
  for (const value of [input, new DataView(padded.buffer, padded.byteOffset + 1, input.length)]) {
    const actual = zlib.brotliDecompressSync(value);
    expect(Buffer.isBuffer(actual)).toBe(true);
    expect(actual).toEqual(expected);
  }
  const result = zlib.brotliDecompressSync(input, { info: true });
  expect(result.buffer).toEqual(expected);
  expect(result.engine).toBeInstanceOf(zlib.BrotliDecompress);
  expect(result.engine.bytesWritten).toBe(input.length);
  expect(() => zlib.brotliDecompressSync(input, { maxOutputLength: 1 })).toThrow(
    expect.objectContaining({ code: "ERR_BUFFER_TOO_LARGE" }),
  );
});
test("brotliDecompressSync preserves native corrupt-input error fields", () => {
  let expected: unknown;
  try {
    native.brotliDecompressSync(Buffer.from("invalid"));
  } catch (error) {
    expected = error;
  }
  expect(() => zlib.brotliDecompressSync(Buffer.from("invalid"))).toThrow(
    expect.objectContaining({ code: (expected as { code: string }).code }),
  );
});
