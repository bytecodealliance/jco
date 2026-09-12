import { expect, test } from "vitest";
import native from "node:zlib";
import { Buffer } from "node:buffer";
import { zlib } from "../helpers/zlib.js";
const plain = Buffer.from("zlib round trip — ".repeat(100));
const input = native.deflateRawSync(plain);

test("inflateRawSync agrees with Node for views, info and output limits", () => {
  const expected = native.inflateRawSync(input);
  const padded = Buffer.concat([Buffer.from([255]), input, Buffer.from([255])]);
  for (const value of [input, new DataView(padded.buffer, padded.byteOffset + 1, input.length)]) {
    const actual = zlib.inflateRawSync(value);
    expect(Buffer.isBuffer(actual)).toBe(true);
    expect(actual).toEqual(expected);
  }
  const result = zlib.inflateRawSync(input, { info: true });
  expect(result.buffer).toEqual(expected);
  expect(result.engine).toBeInstanceOf(zlib.InflateRaw);
  expect(result.engine.bytesWritten).toBe(input.length);
  expect(() => zlib.inflateRawSync(input, { maxOutputLength: 1 })).toThrow(
    expect.objectContaining({ code: "ERR_BUFFER_TOO_LARGE" }),
  );
});
test("inflateRawSync preserves native corrupt-input error fields", () => {
  let expected: unknown;
  try {
    native.inflateRawSync(Buffer.from("invalid"));
  } catch (error) {
    expected = error;
  }
  expect(() => zlib.inflateRawSync(Buffer.from("invalid"))).toThrow(
    expect.objectContaining({ code: (expected as { code: string }).code }),
  );
});
