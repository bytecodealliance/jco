import { expect, test } from "vitest";
import native from "node:zlib";
import { Buffer } from "node:buffer";
import { zlib } from "../helpers/zlib.js";

const plain = Buffer.from("zlib round trip — ".repeat(100));
const input = plain;

test("deflateRawSync agrees with Node for views, info and output limits", () => {
  const expected = native.deflateRawSync(input);
  const padded = Buffer.concat([Buffer.from([255]), input, Buffer.from([255])]);
  for (const value of [input, new DataView(padded.buffer, padded.byteOffset + 1, input.length)]) {
    const actual = zlib.deflateRawSync(value);
    expect(Buffer.isBuffer(actual)).toBe(true);
    expect(actual).toEqual(expected);
  }

  const result = zlib.deflateRawSync(input, { info: true });
  expect(result.buffer).toEqual(expected);
  expect(result.engine).toBeInstanceOf(zlib.DeflateRaw);
  expect(result.engine.bytesWritten).toBe(input.length);
  expect(() => zlib.deflateRawSync(input, { maxOutputLength: 1 })).toThrow(
    expect.objectContaining({ code: "ERR_BUFFER_TOO_LARGE" }),
  );
});

test("deflateRawSync handles empty and UTF-8 input", () => {
  for (const input of ["", "hello 💚"]) {
    expect(zlib.deflateRawSync(input)).toEqual(native.deflateRawSync(input));
  }
});
