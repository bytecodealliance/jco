import { expect, test } from "vitest";
import native from "node:zlib";
import { Buffer } from "node:buffer";
import { zlib, collect } from "../helpers/zlib.js";

const plain = Buffer.from("zlib round trip — ".repeat(100));
const input = native.brotliCompressSync(plain);

test("createBrotliDecompress streams multiple writes with native state", async () => {
  const stream = zlib.createBrotliDecompress();
  expect(stream).toBeInstanceOf(zlib.BrotliDecompress);
  const output = await collect(stream, [input.subarray(0, 5), input.subarray(5)]);
  expect(output).toEqual(native.brotliDecompressSync(input));
  expect(stream.bytesWritten).toBe(input.length);
  stream.close();
});
