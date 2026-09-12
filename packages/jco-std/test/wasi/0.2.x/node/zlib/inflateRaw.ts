import { expect, test } from "vitest";
import native from "node:zlib";
import { Buffer } from "node:buffer";
import { zlib, callbackResult } from "../helpers/zlib.js";
const plain = Buffer.from("zlib round trip — ".repeat(100));
const input = native.deflateRawSync(plain);

test("inflateRaw callback runs later with native bytes", async () => {
  let synchronous = true;
  const result = callbackResult((callback): void => {
    zlib.inflateRaw(input, (...args): void => {
      expect(synchronous).toBe(false);
      callback(...args);
    });
  });
  synchronous = false;
  expect(await result).toEqual(native.inflateRawSync(input));
  expect(await callbackResult((cb): void => zlib.inflateRaw(input, { chunkSize: 64 }, cb))).toEqual(
    native.inflateRawSync(input),
  );
});
