import { describe, expect, test } from "vitest";

import {
  encodeFrame,
  FRAME,
  FrameReader,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/http2/impl/frames.js";
import {
  encodeHeaders,
  HpackDecoder,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/http2/impl/hpack.js";

function bytes(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/../g)!.map((value) => Number.parseInt(value, 16)));
}

describe("HTTP/2 wire codecs", () => {
  test("decodes the RFC 7541 Huffman request example", () => {
    const decoder = new HpackDecoder();
    const fields = decoder.decode(bytes("828684418cf1e3c2e5f23a6ba0ab90f4ff"));
    expect(fields.map(({ name, value }) => [name, new TextDecoder().decode(value)])).toEqual([
      [":method", "GET"],
      [":scheme", "http"],
      [":path", "/"],
      [":authority", "www.example.com"],
    ]);
  });

  test("round trips non-indexed fields and indexed pseudo-headers", () => {
    const fields = [
      { name: ":method", value: new TextEncoder().encode("POST") },
      { name: "x-test", value: new TextEncoder().encode("hello") },
    ];
    const decoded = new HpackDecoder().decode(encodeHeaders(fields));
    expect(decoded).toEqual(fields);
  });

  test("reads a frame split across transport reads", () => {
    const encoded = encodeFrame({
      type: FRAME.data,
      flags: 1,
      streamId: 3,
      payload: bytes("01020304"),
    });
    let offset = 0;
    const reader = new FrameReader({
      blockingRead() {
        const result = encoded.slice(offset, offset + 2);
        offset += result.byteLength;
        return result;
      },
    });
    expect(reader.readFrame()).toEqual({
      type: FRAME.data,
      flags: 1,
      streamId: 3,
      payload: bytes("01020304"),
    });
  });
});
