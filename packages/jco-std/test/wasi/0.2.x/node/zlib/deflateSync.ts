import { expect, test } from "vitest";
import native from "node:zlib";
import { Buffer } from "node:buffer";
import { zlib } from "../helpers/zlib.js";
const plain = Buffer.from("zlib round trip — ".repeat(100));
const input = plain;

test("deflateSync agrees with Node for views, info and output limits", () => {
  const expected = native.deflateSync(input);
  const padded = Buffer.concat([Buffer.from([255]), input, Buffer.from([255])]);
  for (const value of [input, new DataView(padded.buffer, padded.byteOffset + 1, input.length)]) {
    const actual = zlib.deflateSync(value);
    expect(Buffer.isBuffer(actual)).toBe(true);
    expect(actual).toEqual(expected);
  }
  const result = zlib.deflateSync(input, { info: true });
  expect(result.buffer).toEqual(expected);
  expect(result.engine).toBeInstanceOf(zlib.Deflate);
  expect(result.engine.bytesWritten).toBe(input.length);
  expect(() => zlib.deflateSync(input, { maxOutputLength: 1 })).toThrow(
    expect.objectContaining({ code: "ERR_BUFFER_TOO_LARGE" }),
  );
});
test("deflateSync handles empty and UTF-8 input", () => {
  for (const input of ["", "hello 💚"]) {
    expect(zlib.deflateSync(input)).toEqual(native.deflateSync(input));
  }
});
