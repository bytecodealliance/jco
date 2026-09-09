import * as native from "node:stream";
import { describe, expect, test } from "vitest";
import stream, * as shim from "../../../../../../src/wasi/0.2.x/node/24.x.x/stream/index.js";
import promises from "../../../../../../src/wasi/0.2.x/node/24.x.x/stream/promises.js";

describe("node:stream module contract", () => {
  test.concurrent("matches the Node 24 export keys and shared identities", () => {
    expect(Object.keys(shim).sort()).toEqual(Object.keys(native).sort());
    expect(stream).toBe(shim.Stream);
    expect(stream.Stream).toBe(stream);
    expect(stream.promises).toBe(promises);
    expect(stream.Readable).toBe(shim.Readable);
    expect(stream.Readable.isDisturbed).toBe(shim.isDisturbed);
    expect(Reflect.get(stream.pipeline, Symbol.for("nodejs.util.promisify.custom"))).toBe(
      promises.pipeline,
    );
    expect(Reflect.get(stream.finished, Symbol.for("nodejs.util.promisify.custom"))).toBe(
      promises.finished,
    );
    expect(new stream()).toBeInstanceOf(stream);
    expect(() => Reflect.apply(stream, undefined, [])).toThrow(TypeError);
    expect(() => Reflect.apply(native.default, undefined, [])).toThrow(TypeError);
    expect(shim.Readable()).toBeInstanceOf(shim.Readable);
    expect(shim.Writable()).toBeInstanceOf(shim.Writable);
    expect(new shim.PassThrough()).toBeInstanceOf(shim.Transform);
    expect(new shim.Transform()).toBeInstanceOf(shim.Duplex);
    expect(new shim.Duplex()).toBeInstanceOf(shim.Readable);
    expect(new shim.Duplex()).toBeInstanceOf(shim.Writable);
  });

  test("keeps configurable high water marks shared by every constructor", () => {
    const bytes = shim.getDefaultHighWaterMark(false);
    const objects = shim.getDefaultHighWaterMark(true);
    expect(bytes).toBe(65536);
    expect(objects).toBe(16);
    try {
      shim.setDefaultHighWaterMark(false, 4096);
      shim.setDefaultHighWaterMark(true, 4);
      expect(new shim.Readable().readableHighWaterMark).toBe(4096);
      expect(new shim.Writable({ objectMode: true }).writableHighWaterMark).toBe(4);
      expect(new shim.Duplex().writableHighWaterMark).toBe(4096);
      expect(() => shim.setDefaultHighWaterMark(false, -1)).toThrow(
        expect.objectContaining({ code: "ERR_OUT_OF_RANGE" }),
      );
    } finally {
      shim.setDefaultHighWaterMark(false, bytes);
      shim.setDefaultHighWaterMark(true, objects);
    }
  });

  test.concurrent("exports lifecycle predicates and typed-array helpers", async () => {
    const readable = shim.Readable.from([1]);
    expect(shim.isReadable(readable)).toBe(true);
    expect(shim.isWritable(readable)).toBe(null);
    expect(shim.isDisturbed(readable)).toBe(false);
    expect(shim.isDestroyed(readable)).toBe(false);
    expect(shim._isArrayBufferView(new DataView(new ArrayBuffer(2)))).toBe(true);
    expect(shim._isUint8Array(new Uint16Array(1))).toBe(false);
    expect(Array.from(shim._uint8ArrayToBuffer(new Uint8Array([1, 2])))).toEqual([1, 2]);
    await readable.toArray();
    expect(shim.isDisturbed(readable)).toBe(true);
    expect(shim.isReadable(readable)).toBe(false);
    expect(shim.isDestroyed(readable)).toBe(true);
  });
});
