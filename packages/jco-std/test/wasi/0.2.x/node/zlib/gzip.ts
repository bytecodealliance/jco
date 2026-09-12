import { expect, test } from "vitest";
import native from "node:zlib";
import { Buffer } from "node:buffer";
import { zlib, callbackResult } from "../helpers/zlib.js";

const plain = Buffer.from("zlib round trip — ".repeat(100));
const input = plain;

test("gzip callback runs later with native bytes", async () => {
  let synchronous = true;
  const result = callbackResult((callback): void => {
    zlib.gzip(input, (...args): void => {
      expect(synchronous).toBe(false);
      callback(...args);
    });
  });
  synchronous = false;
  expect(await result).toEqual(native.gzipSync(input));
  expect(await callbackResult((cb): void => zlib.gzip(input, { chunkSize: 64 }, cb))).toEqual(
    native.gzipSync(input),
  );
});

test("gzip callback info, output limit and missing callback", async () => {
  const info = await new Promise<
    import("../../../../../src/wasi/0.2.x/node/24.x.x/zlib/types.js").ZlibInfo
  >((resolve, reject): void => {
    zlib.gzip(input, { info: true }, (...args): void => {
      if (args[0]) {
        reject(args[0]);
      } else {
        resolve(args[1]);
      }
    });
  });
  expect(info.engine).toBeInstanceOf(zlib.Gzip);
  expect(info.engine.bytesWritten).toBe(input.length);
  expect(native.gunzipSync(info.buffer)).toEqual(input);
  await expect(
    callbackResult((cb): void => zlib.gzip(input, { maxOutputLength: 1 }, cb)),
  ).rejects.toMatchObject({ code: "ERR_BUFFER_TOO_LARGE" });
  expect(() => Reflect.apply(zlib.gzip, undefined, [input])).toThrow(
    expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
  );
});
