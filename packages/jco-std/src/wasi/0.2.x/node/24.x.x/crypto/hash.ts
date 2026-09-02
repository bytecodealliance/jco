/**
 * `crypto.Hash` and `crypto.Hmac`, over the synchronous digests in `./digest.ts`.
 *
 * These accumulate their input and hash it in `digest()` rather than streaming block by
 * block. Message digests in a request handler are small -- an ETag over a response body, an
 * HMAC over a cookie -- so the simpler shape is the right trade here.
 */

import {
  BLOCK_LENGTH,
  DIGEST_LENGTH,
  digest as computeDigest,
  normalizeAlgorithm,
  type DigestAlgorithm,
} from "./digest.js";
import { unsupportedAlgorithm } from "./errors.js";

const ENCODER = new TextEncoder();

const HEX = "0123456789abcdef";

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Encodings `digest()` and `update()` accept, beyond raw bytes. */
export type DigestEncoding =
  | "hex"
  | "base64"
  | "base64url"
  | "latin1"
  | "binary"
  | "utf8"
  | "utf-8";

function toBytes(data: unknown, encoding?: string): Uint8Array {
  if (typeof data === "string") {
    if (encoding === "hex") {
      const bytes = new Uint8Array(data.length >> 1);
      for (let i = 0; i < bytes.length; i += 1) {
        bytes[i] = Number.parseInt(data.slice(i * 2, i * 2 + 2), 16);
      }
      return bytes;
    }
    if (encoding === "latin1" || encoding === "binary") {
      const bytes = new Uint8Array(data.length);
      for (let i = 0; i < data.length; i += 1) {
        bytes[i] = data.charCodeAt(i) & 0xff;
      }
      return bytes;
    }
    if (encoding === "base64" || encoding === "base64url") {
      const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
      const binary = atob(normalized);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    }
    return ENCODER.encode(data);
  }
  if (data instanceof Uint8Array) {
    return data;
  }
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  throw new TypeError(
    `data must be a string, Buffer, TypedArray or ArrayBuffer, received [${typeof data}]`,
  );
}

function hex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) {
    out += HEX[byte >> 4] + HEX[byte & 0x0f];
  }
  return out;
}

function base64(bytes: Uint8Array, urlSafe: boolean): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const triple = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += BASE64[(triple >> 18) & 63];
    out += BASE64[(triple >> 12) & 63];
    out += i + 1 < bytes.length ? BASE64[(triple >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? BASE64[triple & 63] : "=";
  }
  if (!urlSafe) {
    return out;
  }
  return out.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Encode a digest the way Node's `digest(encoding)` does.
 *
 * With no encoding Node returns a `Buffer`. Guests get `Buffer` from the bundler rather than
 * from jco-std, so this hands back the global when there is one and a `Uint8Array` -- which
 * `Buffer` is a subclass of -- when there is not.
 */
export function encodeDigest(bytes: Uint8Array, encoding?: string): string | Uint8Array {
  switch (encoding) {
    case undefined:
    case "buffer": {
      const buffer = (globalThis as { Buffer?: { from(b: Uint8Array): Uint8Array } }).Buffer;
      return buffer ? buffer.from(bytes) : bytes;
    }
    case "hex":
      return hex(bytes);
    case "base64":
      return base64(bytes, false);
    case "base64url":
      return base64(bytes, true);
    case "latin1":
    case "binary":
      return String.fromCharCode(...bytes);
    case "utf8":
    case "utf-8":
      return new TextDecoder().decode(bytes);
    default:
      throw new TypeError(`Unknown digest encoding [${encoding}]`);
  }
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return joined;
}

/**
 * A message digest, as `crypto.createHash()` returns.
 *
 * @see https://nodejs.org/docs/latest-v24.x/api/crypto.html#class-hash
 */
export class Hash {
  readonly #algorithm: DigestAlgorithm;
  #chunks: Uint8Array[] = [];
  #digested = false;

  constructor(algorithm: string) {
    const normalized = normalizeAlgorithm(algorithm);
    if (!normalized) {
      throw unsupportedAlgorithm(algorithm);
    }
    this.#algorithm = normalized;
  }

  /** Add data to the digest. */
  update(data: unknown, inputEncoding?: string): this {
    if (this.#digested) {
      const error = new Error("Digest already called") as Error & { code: string };
      error.code = "ERR_CRYPTO_HASH_FINALIZED";
      throw error;
    }
    this.#chunks.push(toBytes(data, inputEncoding));
    return this;
  }

  /** Finish the digest and encode it. */
  digest(encoding?: string): string | Uint8Array {
    this.#digested = true;
    return encodeDigest(computeDigest(this.#algorithm, concat(this.#chunks)), encoding);
  }

  /** Copy the digest's current state, as Node's `hash.copy()` does. */
  copy(): Hash {
    const copy = new Hash(this.#algorithm);
    copy.#chunks = [...this.#chunks];
    return copy;
  }
}

/**
 * A keyed message digest, as `crypto.createHmac()` returns.
 *
 * @see https://nodejs.org/docs/latest-v24.x/api/crypto.html#class-hmac
 */
export class Hmac {
  readonly #algorithm: DigestAlgorithm;
  readonly #innerKey: Uint8Array;
  readonly #outerKey: Uint8Array;
  #chunks: Uint8Array[] = [];
  #digested = false;

  constructor(algorithm: string, key: unknown, options?: { encoding?: string }) {
    const normalized = normalizeAlgorithm(algorithm);
    if (!normalized) {
      throw unsupportedAlgorithm(algorithm);
    }
    this.#algorithm = normalized;

    const blockLength = BLOCK_LENGTH[normalized];
    let keyBytes = toBytes(key, options?.encoding);
    if (keyBytes.length > blockLength) {
      keyBytes = computeDigest(normalized, keyBytes);
    }
    const padded = new Uint8Array(blockLength);
    padded.set(keyBytes);
    this.#innerKey = padded.map((byte) => byte ^ 0x36);
    this.#outerKey = padded.map((byte) => byte ^ 0x5c);
  }

  /** Add data to the digest. */
  update(data: unknown, inputEncoding?: string): this {
    if (this.#digested) {
      const error = new Error("Digest already called") as Error & { code: string };
      error.code = "ERR_CRYPTO_HASH_FINALIZED";
      throw error;
    }
    this.#chunks.push(toBytes(data, inputEncoding));
    return this;
  }

  /** Finish the digest and encode it. */
  digest(encoding?: string): string | Uint8Array {
    this.#digested = true;
    const inner = computeDigest(this.#algorithm, concat([this.#innerKey, ...this.#chunks]));
    const outer = computeDigest(this.#algorithm, concat([this.#outerKey, inner]));
    return encodeDigest(outer, encoding);
  }
}

export { DIGEST_LENGTH };
