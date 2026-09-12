import { expect, test } from "vitest";
import native from "node:zlib";
import { Buffer } from "node:buffer";
import { zlib } from "../helpers/zlib.js";

const plain = Buffer.from("zlib round trip — ".repeat(100));
const input = native.gzipSync(plain);

test("unzipSync agrees with Node for views, info and output limits", () => {
  const expected = native.unzipSync(input);
  const padded = Buffer.concat([Buffer.from([255]), input, Buffer.from([255])]);
  for (const value of [input, new DataView(padded.buffer, padded.byteOffset + 1, input.length)]) {
    const actual = zlib.unzipSync(value);
    expect(Buffer.isBuffer(actual)).toBe(true);
    expect(actual).toEqual(expected);
  }

  const result = zlib.unzipSync(input, { info: true });
  expect(result.buffer).toEqual(expected);
  expect(result.engine).toBeInstanceOf(zlib.Unzip);
  expect(result.engine.bytesWritten).toBe(input.length);
  expect(() => zlib.unzipSync(input, { maxOutputLength: 1 })).toThrow(
    expect.objectContaining({ code: "ERR_BUFFER_TOO_LARGE" }),
  );
});

test("unzipSync preserves native corrupt-input error fields", () => {
  let expected: unknown;
  try {
    native.unzipSync(Buffer.from("invalid"));
  } catch (error) {
    expected = error;
  }

  expect(() => zlib.unzipSync(Buffer.from("invalid"))).toThrow(
    expect.objectContaining({ code: (expected as { code: string }).code }),
  );
});
