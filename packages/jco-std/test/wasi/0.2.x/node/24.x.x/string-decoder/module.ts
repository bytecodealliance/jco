import { Buffer } from "node:buffer";
import nodeStringDecoder, { StringDecoder as NodeStringDecoder } from "node:string_decoder";

import { describe, expect, test } from "vitest";

import stringDecoder, {
  StringDecoder,
  type StringDecoderInputEncoding,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/string-decoder.js";

function errorCode(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error) {
    return (error as Error & { code?: string }).code;
  }
  return undefined;
}

describe("node:string_decoder module", () => {
  test("matches Node's module and prototype shape", () => {
    expect(stringDecoder.StringDecoder).toBe(StringDecoder);
    expect(nodeStringDecoder.StringDecoder).toBe(NodeStringDecoder);
    expect(StringDecoder.name).toBe(NodeStringDecoder.name);
    expect(StringDecoder.length).toBe(NodeStringDecoder.length);
    expect(Object.getOwnPropertyNames(StringDecoder.prototype)).toEqual(
      Object.getOwnPropertyNames(NodeStringDecoder.prototype),
    );

    for (const name of ["write", "end", "text", "lastChar", "lastNeed", "lastTotal"]) {
      expect(Object.getOwnPropertyDescriptor(StringDecoder.prototype, name)?.enumerable).toBe(true);
    }
  });

  test.each([
    [undefined, "utf8"],
    ["", "utf8"],
    ["UTF-8", "utf8"],
    ["UCS-2", "utf16le"],
    ["binary", "latin1"],
    ["BASE64URL", "base64url"],
  ] as const)("normalizes %s to %s", (input, normalized) => {
    expect(new StringDecoder(input).encoding).toBe(normalized);
  });

  test("uses Node error codes for unsupported encodings and invalid input", () => {
    expect(errorCode(() => new StringDecoder("rot13" as StringDecoderInputEncoding))).toBe(
      "ERR_UNKNOWN_ENCODING",
    );
    expect(errorCode(() => new StringDecoder().write(new ArrayBuffer(2) as never))).toBe(
      "ERR_INVALID_ARG_TYPE",
    );
    expect(errorCode(() => StringDecoder.prototype.write.call({}, Buffer.alloc(0)))).toBe(
      "ERR_INVALID_THIS",
    );
  });

  test("buffers split UTF-8 sequences and malformed boundary sequences like Node", () => {
    for (const chunks of [
      [[0xe2], [0x82], [0xac]],
      [[0xc0], [0x80]],
      [
        [0xf0, 0x8f],
        [0x80, 0x80],
      ],
      [[0xe2], [0x41]],
    ]) {
      const expected = new NodeStringDecoder("utf8");
      const actual = new StringDecoder("utf8");
      for (const chunk of chunks) {
        const bytes = Uint8Array.from(chunk);
        expect(actual.write(bytes)).toBe(expected.write(bytes));
        expect(actual.lastNeed).toBe(expected.lastNeed);
        expect(actual.lastTotal).toBe(expected.lastTotal);
      }
      expect(actual.end()).toBe(expected.end());
      expect(actual.lastNeed).toBe(0);
      expect(actual.lastTotal).toBe(0);
    }
  });

  test.each(["utf16le", "ucs2", "base64", "base64url"] as const)(
    "buffers incomplete %s groups",
    (encoding) => {
      const bytes = Buffer.from("A 🌍 B", "utf8");
      const expected = new NodeStringDecoder(encoding);
      const actual = new StringDecoder(encoding);
      const boundaries = [1, 2, 5, bytes.length];
      let start = 0;
      for (const end of boundaries) {
        const chunk = bytes.subarray(start, end);
        expect(actual.write(chunk)).toBe(expected.write(chunk));
        expect(actual.lastNeed).toBe(expected.lastNeed);
        expect(actual.lastTotal).toBe(expected.lastTotal);
        start = end;
      }
      expect(actual.end()).toBe(expected.end());
    },
  );

  test("honors ArrayBufferView byte offsets and accepts DataView", () => {
    const storage = Uint8Array.from([0xff, 0xe2, 0x82, 0xac, 0xff]);
    const typed = storage.subarray(1, 4);
    const data = new DataView(storage.buffer, 1, 3);
    expect(new StringDecoder().end(typed)).toBe("€");
    expect(new StringDecoder().end(data)).toBe("€");
  });

  test("retains Node's legacy state accessors and text method", () => {
    const decoder = new StringDecoder("utf8");
    expect(decoder.write(Uint8Array.of(0xe2))).toBe("");
    expect(decoder.lastNeed).toBe(2);
    expect(decoder.lastTotal).toBe(3);
    expect(Buffer.from(decoder.lastChar)).toHaveLength(4);
    expect(decoder.text(Buffer.from("skipvalue"), 4)).toBe("value");
    expect(decoder.lastNeed).toBe(0);
  });

  test("passes strings through without consuming buffered bytes and can be reused after end", () => {
    const decoder = new StringDecoder();
    decoder.write(Uint8Array.of(0xe2));
    expect(decoder.write("literal")).toBe("literal");
    expect(decoder.lastNeed).toBe(2);
    expect(decoder.end()).toBe("�");
    expect(decoder.end(Buffer.from("again"))).toBe("again");
  });

  test("matches Node over deterministic chunk and view combinations", () => {
    const encodings = [
      undefined,
      "utf8",
      "utf-8",
      "utf16le",
      "ucs2",
      "base64",
      "base64url",
      "ascii",
      "latin1",
      "binary",
      "hex",
    ] as const;
    let seed = 0x5eed1234;
    const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 0x100000000;

    for (const encoding of encodings) {
      for (let sample = 0; sample < 120; sample++) {
        const expected = new NodeStringDecoder(encoding);
        const actual = new StringDecoder(encoding);
        const chunkCount = 1 + Math.floor(random() * 5);

        for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
          const length = Math.floor(random() * 9);
          const bytes = Uint8Array.from({ length }, () => Math.floor(random() * 256));
          const view: ArrayBufferView =
            chunkIndex % 2 === 0
              ? bytes
              : new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
          expect(actual.write(view)).toBe(expected.write(view));
          expect(actual.lastNeed).toBe(expected.lastNeed);
          expect(actual.lastTotal).toBe(expected.lastTotal);
        }

        expect(actual.end()).toBe(expected.end());
        expect(actual.lastNeed).toBe(expected.lastNeed);
        expect(actual.lastTotal).toBe(expected.lastTotal);
      }
    }
  });
});
