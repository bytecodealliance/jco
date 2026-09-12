import { expect, test } from "vitest";
import native from "node:zlib";
import { zlib } from "../helpers/zlib.js";
test("CRC32 known vector, incremental update, Unicode and validation", () => {
  expect(zlib.crc32("123456789")).toBe(0xcbf43926);
  expect(zlib.crc32("456789", zlib.crc32("123"))).toBe(0xcbf43926);
  expect(zlib.crc32("💚")).toBe(native.crc32("💚"));
  expect(zlib.crc32(new Uint8Array())).toBe(0);
  expect(() => zlib.crc32("", -1)).toThrow(expect.objectContaining({ code: "ERR_OUT_OF_RANGE" }));
});
