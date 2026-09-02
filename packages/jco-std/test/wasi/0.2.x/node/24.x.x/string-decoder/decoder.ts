import { StringDecoder as NodeStringDecoder } from "node:string_decoder";

import { describe, expect, test } from "vitest";

import { StringDecoder } from "../../../../../../src/wasi/0.2.x/node/24.x.x/string-decoder/index.js";

/**
 * Node's own `node:string_decoder` is the oracle. What matters is the boundary behavior --
 * a character split across two chunks has to come out whole and exactly once -- so the
 * cases feed the same bytes to both implementations one byte at a time.
 */
function decodeByteByByte(
  decoder: { write(chunk: Uint8Array): string; end(chunk?: Uint8Array): string },
  bytes: Uint8Array,
): string {
  let out = "";
  for (const byte of bytes) {
    out += decoder.write(new Uint8Array([byte]));
  }
  return out + decoder.end();
}

const SAMPLES: Array<[name: string, text: string]> = [
  ["ascii", "plain ascii text"],
  ["two-byte", "café résumé"],
  ["three-byte", "你好，世界"],
  ["four-byte", "emoji: 🚀🎉"],
  ["mixed", "a é 好 🚀 z"],
];

describe("StringDecoder", () => {
  for (const [name, text] of SAMPLES) {
    test(`decodes ${name} utf8 in one chunk like node`, () => {
      const bytes = new TextEncoder().encode(text);
      expect(new StringDecoder("utf8").end(bytes)).toBe(new NodeStringDecoder("utf8").end(bytes));
    });

    test(`decodes ${name} utf8 split across every byte like node`, () => {
      const bytes = new TextEncoder().encode(text);
      expect(decodeByteByByte(new StringDecoder("utf8"), bytes)).toBe(
        decodeByteByByte(new NodeStringDecoder("utf8"), bytes),
      );
      expect(decodeByteByByte(new StringDecoder("utf8"), bytes)).toBe(text);
    });
  }

  test("holds back a partial character until the rest arrives", () => {
    const bytes = new TextEncoder().encode("é");
    const decoder = new StringDecoder("utf8");
    expect(decoder.write(bytes.subarray(0, 1))).toBe("");
    expect(decoder.write(bytes.subarray(1))).toBe("é");
  });

  test("decodes latin1 like node", () => {
    const bytes = new Uint8Array([0x68, 0x69, 0xe9, 0xff]);
    expect(new StringDecoder("latin1").end(bytes)).toBe(new NodeStringDecoder("latin1").end(bytes));
  });

  test("decodes utf16le like node, including across a chunk boundary", () => {
    const bytes = new Uint8Array([0x68, 0x00, 0x69, 0x00, 0x3c, 0xd8, 0x00, 0xdf]);
    expect(decodeByteByByte(new StringDecoder("utf16le"), bytes)).toBe(
      decodeByteByByte(new NodeStringDecoder("utf16le"), bytes),
    );
  });

  test("encodes to base64 like node, across chunk boundaries", () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    for (let split = 0; split <= bytes.length; split += 1) {
      const ours = new StringDecoder("base64");
      const theirs = new NodeStringDecoder("base64");
      const oursOut = ours.write(bytes.subarray(0, split)) + ours.end(bytes.subarray(split));
      const theirsOut = theirs.write(bytes.subarray(0, split)) + theirs.end(bytes.subarray(split));
      expect(oursOut, `split at ${split}`).toBe(theirsOut);
    }
  });

  test("encodes to hex like node", () => {
    const bytes = new Uint8Array([0, 15, 16, 255]);
    expect(new StringDecoder("hex").end(bytes)).toBe(new NodeStringDecoder("hex").end(bytes));
  });

  test("reports the encoding it was created with", () => {
    expect(new StringDecoder("utf8").encoding).toBe("utf8");
  });

  test("rejects an unknown encoding, as node does", () => {
    expect(() => new StringDecoder("klingon")).toThrowError(
      expect.objectContaining({ code: "ERR_UNKNOWN_ENCODING" }),
    );
  });
});
