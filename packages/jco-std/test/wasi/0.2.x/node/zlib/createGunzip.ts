import { expect, test } from "vitest";
import native from "node:zlib";
import { Buffer } from "node:buffer";
import { zlib, collect } from "../helpers/zlib.js";
const plain = Buffer.from("zlib round trip — ".repeat(100));
const input = native.gzipSync(plain);

test("createGunzip streams multiple writes with native state", async () => {
  const stream = zlib.createGunzip();
  expect(stream).toBeInstanceOf(zlib.Gunzip);
  const output = await collect(stream, [input.subarray(0, 5), input.subarray(5)]);
  expect(output).toEqual(native.gunzipSync(input));
  expect(stream.bytesWritten).toBe(input.length);
  stream.close();
});
