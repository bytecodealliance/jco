import { describe, expect, test } from "vitest";

import {
  bytes,
  bytesSync,
  from,
  fromSync,
  text,
  textSync,
  toAsyncStreamable,
  toStreamable,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/stream/iter/index.js";

describe("stream/iter sources", () => {
  test("normalizes strings, buffers, views, and recursively nested iterables", async () => {
    const view = new DataView(new Uint8Array([99]).buffer);
    expect(await text(from(["a", [new Uint8Array([98]), view]]))).toBe("abc");
    expect(textSync(fromSync(["a", [new Uint8Array([98]), view]]))).toBe("abc");
  });

  test("prefers async and sync conversion protocols over iteration", async () => {
    const value = {
      [toAsyncStreamable]: () => "async",
      [toStreamable]: () => "sync",
      *[Symbol.iterator]() {
        yield "iterator";
      },
    };
    expect(await text(from(value))).toBe("async");
    expect(textSync(fromSync(value))).toBe("sync");
  });

  test("accepts promises yielded by async sources", async () => {
    async function* source(): AsyncIterable<unknown> {
      yield Promise.resolve("a");
      yield [Promise.resolve(new Uint8Array([98]))];
    }
    expect(await text(from(source()))).toBe("ab");
  });

  test("bounds pre-batched arrays", async () => {
    const input = Array.from({ length: 257 }, () => new Uint8Array([1]));
    const batches: number[] = [];
    for await (const batch of from(input)) {
      batches.push(batch.length);
    }
    expect(batches).toEqual([128, 128, 1]);
    expect((await bytes(from(input))).byteLength).toBe(257);
    expect(bytesSync(fromSync(input)).byteLength).toBe(257);
  });

  test("rejects null, invalid, and async-only sync sources", () => {
    expect(() => from(null as never)).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
    );
    expect(() => from({} as never)).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
    );
    expect(() => fromSync((async function* () {})() as never)).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
    );
  });
});
