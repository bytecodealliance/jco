import { expect, test } from "vitest";
import native from "node:zlib";
import { Buffer } from "node:buffer";
import { zlib } from "../helpers/zlib.js";
const plain = Buffer.from("zlib round trip — ".repeat(100));
const input = native.gzipSync(plain);

test("gunzipSync agrees with Node for views, info and output limits", () => {
  const expected = native.gunzipSync(input);
  const padded = Buffer.concat([Buffer.from([255]), input, Buffer.from([255])]);
  for (const value of [input, new DataView(padded.buffer, padded.byteOffset + 1, input.length)]) {
    const actual = zlib.gunzipSync(value);
    expect(Buffer.isBuffer(actual)).toBe(true);
    expect(actual).toEqual(expected);
  }
  const result = zlib.gunzipSync(input, { info: true });
  expect(result.buffer).toEqual(expected);
  expect(result.engine).toBeInstanceOf(zlib.Gunzip);
  expect(result.engine.bytesWritten).toBe(input.length);
  expect(() => zlib.gunzipSync(input, { maxOutputLength: 1 })).toThrow(
    expect.objectContaining({ code: "ERR_BUFFER_TOO_LARGE" }),
  );
});
test("gunzipSync preserves native corrupt-input error fields", () => {
  let expected: unknown;
  try {
    native.gunzipSync(Buffer.from("invalid"));
  } catch (error) {
    expected = error;
  }
  expect(() => zlib.gunzipSync(Buffer.from("invalid"))).toThrow(
    expect.objectContaining({ code: (expected as { code: string }).code }),
  );
});
