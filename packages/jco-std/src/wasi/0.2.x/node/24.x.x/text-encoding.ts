import { Buffer } from "node:buffer";

class PortableTextEncoder {
  readonly encoding = "utf-8";
  encode(input = ""): Uint8Array {
    return new Uint8Array(Buffer.from(String(input), "utf8"));
  }
  encodeInto(input: string, destination: Uint8Array): { read: number; written: number } {
    let read = 0,
      written = 0;
    for (const character of String(input)) {
      const bytes = this.encode(character);
      if (written + bytes.length > destination.length) {
        break;
      }
      destination.set(bytes, written);
      written += bytes.length;
      read += character.length;
    }
    return { read, written };
  }
}

class PortableTextDecoder {
  readonly encoding: string;
  readonly fatal: boolean;
  readonly ignoreBOM: boolean;
  #pending = Buffer.alloc(0);
  #atStart = true;

  constructor(label = "utf-8", options: TextDecoderOptions = {}) {
    const normalized = String(label).trim().toLowerCase();
    if (["utf-8", "utf8", "unicode-1-1-utf-8"].includes(normalized)) {
      this.encoding = "utf-8";
    } else if (
      ["latin1", "iso-8859-1", "iso8859-1", "windows-1252", "ascii", "us-ascii"].includes(
        normalized,
      )
    ) {
      this.encoding = "windows-1252";
    } else {
      throw new RangeError(`The encoding label provided ('${label}') is invalid`);
    }
    this.fatal = Boolean(options.fatal);
    this.ignoreBOM = Boolean(options.ignoreBOM);
  }

  decode(input?: AllowSharedBufferSource, options: TextDecodeOptions = {}): string {
    const view =
      input === undefined
        ? new Uint8Array()
        : ArrayBuffer.isView(input)
          ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
          : new Uint8Array(input);
    if (this.encoding === "windows-1252") {
      const c1 = [
        0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039,
        0x152, 0x8d, 0x17d, 0x8f, 0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
        0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178,
      ];
      return Array.from(view, (byte) =>
        String.fromCharCode(byte >= 128 && byte < 160 ? c1[byte - 128] : byte),
      ).join("");
    }
    let bytes = Buffer.concat([this.#pending, Buffer.from(view)]);
    this.#pending = Buffer.alloc(0);
    if (options.stream && bytes.length) {
      let start = bytes.length - 1;
      while (start >= 0 && (bytes[start] & 0xc0) === 0x80) {
        start--;
      }
      const lead = bytes[start];
      const expected =
        lead >= 0xc2 && lead <= 0xdf
          ? 2
          : lead >= 0xe0 && lead <= 0xef
            ? 3
            : lead >= 0xf0 && lead <= 0xf4
              ? 4
              : 0;
      if (expected && bytes.length - start < expected) {
        this.#pending = bytes.subarray(start);
        bytes = bytes.subarray(0, start);
      }
    }
    let value = bytes.toString("utf8");
    if (this.fatal && !Buffer.from(value, "utf8").equals(bytes)) {
      this.#pending = Buffer.alloc(0);
      this.#atStart = true;
      throw new TypeError("The encoded data was not valid for encoding utf-8");
    }
    if (this.#atStart && value.length) {
      this.#atStart = false;
      if (!this.ignoreBOM && value.charCodeAt(0) === 0xfeff) {
        value = value.slice(1);
      }
    }
    if (!options.stream) {
      this.#atStart = true;
    }
    return value;
  }
}

export const TextEncoder: typeof globalThis.TextEncoder =
  globalThis.TextEncoder ?? (PortableTextEncoder as typeof globalThis.TextEncoder);
export const TextDecoder: typeof globalThis.TextDecoder =
  globalThis.TextDecoder ?? (PortableTextDecoder as typeof globalThis.TextDecoder);
