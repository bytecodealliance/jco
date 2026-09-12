/**
 * `node:crypto` for a component.
 *
 * Two things are real here. The synchronous digest surface -- `createHash`, `createHmac`,
 * `hash` -- is implemented in JavaScript, because Node-shaped HTTP middleware calls it
 * inline and cannot await: `etag` hashes a response body on Express's default `res.send()`
 * path, and `cookie-signature` HMACs a cookie the same way. Randomness is the engine's
 * WebCrypto, which is backed by `wasi:random`.
 *
 * Everything else -- ciphers, key objects, signatures, certificates, key derivation --
 * belongs to `crypto.subtle`, which the engine implements natively, and throws here rather
 * than offering a JavaScript imitation of a security primitive.
 */

import { unsupported, useWebCrypto } from "./errors.js";
import { encodeDigest, Hash, Hmac } from "./hash.js";

export { Hash, Hmac } from "./hash.js";
export { UNSUPPORTED_CODE } from "./errors.js";

/** The engine's WebCrypto implementation. */
function webCryptoOrThrow(): Crypto {
  const impl = globalThis.crypto;
  if (!impl) {
    throw unsupported(
      "node:crypto randomness",
      "the component engine did not provide WebCrypto; the world must import `wasi:random`",
    );
  }
  return impl;
}

/**
 * Create a message digest.
 *
 * @param algorithm - `"sha1"` or `"sha256"`; other algorithms are refused
 * @returns a `Hash` that accumulates input until `digest()`
 */
export function createHash(algorithm: string): Hash {
  return new Hash(algorithm);
}

/**
 * Create a keyed message digest.
 *
 * @param algorithm - `"sha1"` or `"sha256"`; other algorithms are refused
 * @param key - the HMAC key
 * @param options - Node's options, of which only `encoding` is read
 * @returns an `Hmac` that accumulates input until `digest()`
 */
export function createHmac(algorithm: string, key: unknown, options?: { encoding?: string }): Hmac {
  return new Hmac(algorithm, key, options);
}

/**
 * Hash data in one call, as Node's `crypto.hash()` does.
 *
 * @param algorithm - `"sha1"` or `"sha256"`; other algorithms are refused
 * @param data - the data to hash
 * @param outputEncoding - digest encoding, defaulting to Node's `"hex"`
 * @returns the encoded digest
 */
export function hash(
  algorithm: string,
  data: unknown,
  outputEncoding: string = "hex",
): string | Uint8Array {
  return new Hash(algorithm).update(data).digest(outputEncoding);
}

/** The engine's `crypto.getRandomValues()`. */
export function getRandomValues<T extends ArrayBufferView>(typedArray: T): T {
  webCryptoOrThrow().getRandomValues(typedArray as ArrayBufferView<ArrayBuffer>);
  return typedArray;
}

/** The engine's `crypto.randomUUID()`. */
export function randomUUID(): string {
  return webCryptoOrThrow().randomUUID();
}

/**
 * Fill a buffer with random bytes, as Node's `crypto.randomFillSync()` does.
 *
 * @param buffer - the buffer to fill
 * @param offset - where to start filling, defaulting to 0
 * @param size - how many bytes to fill, defaulting to the rest of the buffer
 * @returns the buffer that was passed in
 */
export function randomFillSync<T extends ArrayBufferView>(buffer: T, offset = 0, size?: number): T {
  const view = new Uint8Array(
    buffer.buffer as ArrayBuffer,
    buffer.byteOffset + offset,
    size ?? buffer.byteLength - offset,
  );
  webCryptoOrThrow().getRandomValues(view);
  return buffer;
}

/**
 * Produce random bytes, as Node's `crypto.randomBytes()` does.
 *
 * @param size - how many bytes to produce
 * @param callback - Node's optional callback form
 * @returns the bytes, or `undefined` when a callback was given
 */
export function randomBytes(
  size: number,
  callback?: (err: Error | null, bytes: Uint8Array) => void,
): Uint8Array | undefined {
  const bytes = new Uint8Array(size);
  webCryptoOrThrow().getRandomValues(bytes);
  const buffer = (globalThis as { Buffer?: { from(b: Uint8Array): Uint8Array } }).Buffer;
  const result = buffer ? buffer.from(bytes) : bytes;
  if (callback) {
    callback(null, result);
    return undefined;
  }
  return result;
}

/**
 * Produce a random integer in `[min, max)`, as Node's `crypto.randomInt()` does.
 *
 * @param minOrMax - the lower bound, or the upper bound when called with one argument
 * @param maxOrCallback - the upper bound, or Node's callback
 * @param callback - Node's optional callback form
 * @returns the integer, or `undefined` when a callback was given
 */
export function randomInt(
  minOrMax: number,
  maxOrCallback?: number | ((err: Error | null, value: number) => void),
  callback?: (err: Error | null, value: number) => void,
): number | undefined {
  const hasExplicitMin = typeof maxOrCallback === "number";
  const min = hasExplicitMin ? minOrMax : 0;
  const max = hasExplicitMin ? (maxOrCallback as number) : minOrMax;
  const done = typeof maxOrCallback === "function" ? maxOrCallback : callback;

  const range = max - min;
  if (!Number.isSafeInteger(range) || range <= 0) {
    throw new RangeError('The value of "max" is out of range');
  }
  // Reject values in the final, partial bucket so every outcome stays equally likely.
  const limit = Math.floor(0x100000000 / range) * range;
  const scratch = new Uint32Array(1);
  let draw: number;
  do {
    webCryptoOrThrow().getRandomValues(scratch);
    draw = scratch[0];
  } while (draw >= limit);
  const value = min + (draw % range);

  if (done) {
    done(null, value);
    return undefined;
  }
  return value;
}

/**
 * Compare two buffers, as Node's `crypto.timingSafeEqual()` does.
 *
 * The comparison does not short-circuit, but the guest's JavaScript engine offers no
 * constant-time guarantee; treat this as a convenience, not a defense.
 */
export function timingSafeEqual(a: ArrayBufferView, b: ArrayBufferView): boolean {
  if (a.byteLength !== b.byteLength) {
    const error = new RangeError("Input buffers must have the same byte length") as RangeError & {
      code: string;
    };
    error.code = "ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH";
    throw error;
  }
  const left = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  const right = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) {
    difference |= left[i] ^ right[i];
  }
  return difference === 0;
}

/** The engine's WebCrypto, which Node also exposes under this name. */
export const webcrypto: Crypto = new Proxy({} as Crypto, {
  get(_target, property) {
    return Reflect.get(webCryptoOrThrow(), property);
  },
});

/** The engine's `SubtleCrypto`, which Node also exposes under this name. */
export const subtle: SubtleCrypto = new Proxy({} as SubtleCrypto, {
  get(_target, property) {
    return Reflect.get(webCryptoOrThrow().subtle, property);
  },
});

/** Digest algorithms `createHash()` accepts here. */
export function getHashes(): string[] {
  return ["sha1", "sha256"];
}

/** Node's FIPS flag, which a component's engine never sets. */
export const fips = false;

/** Node's `crypto.getFips()`. */
export function getFips(): number {
  return 0;
}

function refuse(api: string): () => never {
  return () => {
    throw useWebCrypto(api);
  };
}

/** Ciphers belong to `crypto.subtle`. */
export const createCipheriv = refuse("crypto.createCipheriv()");

/** Ciphers belong to `crypto.subtle`. */
export const createDecipheriv = refuse("crypto.createDecipheriv()");

/** Signatures belong to `crypto.subtle`. */
export const createSign = refuse("crypto.createSign()");

/** Signatures belong to `crypto.subtle`. */
export const createVerify = refuse("crypto.createVerify()");

/** Key objects belong to `crypto.subtle`. */
export const createPrivateKey = refuse("crypto.createPrivateKey()");

/** Key objects belong to `crypto.subtle`. */
export const createPublicKey = refuse("crypto.createPublicKey()");

/** Key objects belong to `crypto.subtle`. */
export const createSecretKey = refuse("crypto.createSecretKey()");

/** Key generation belongs to `crypto.subtle`. */
export const generateKeyPairSync = refuse("crypto.generateKeyPairSync()");

/** Key generation belongs to `crypto.subtle`. */
export const generateKeyPair = refuse("crypto.generateKeyPair()");

/** Key derivation belongs to `crypto.subtle`. */
export const pbkdf2Sync = refuse("crypto.pbkdf2Sync()");

/** Key derivation belongs to `crypto.subtle`. */
export const pbkdf2 = refuse("crypto.pbkdf2()");

/** Key derivation belongs to `crypto.subtle`. */
export const hkdfSync = refuse("crypto.hkdfSync()");

/** Key derivation belongs to `crypto.subtle`. */
export const hkdf = refuse("crypto.hkdf()");

/** Diffie-Hellman belongs to `crypto.subtle`. */
export const createDiffieHellman = refuse("crypto.createDiffieHellman()");

/** Elliptic-curve Diffie-Hellman belongs to `crypto.subtle`. */
export const createECDH = refuse("crypto.createECDH()");

/** X.509 handling has no component equivalent. */
export const X509Certificate = class {
  constructor() {
    throw unsupported(
      "new crypto.X509Certificate()",
      "certificate parsing is not part of the component engine's cryptography",
    );
  }
};

export { encodeDigest };

export default {
  Hash,
  Hmac,
  X509Certificate,
  createCipheriv,
  createDecipheriv,
  createDiffieHellman,
  createECDH,
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  createSecretKey,
  createSign,
  createVerify,
  fips,
  generateKeyPair,
  generateKeyPairSync,
  getFips,
  getHashes,
  getRandomValues,
  hash,
  hkdf,
  hkdfSync,
  pbkdf2,
  pbkdf2Sync,
  randomBytes,
  randomFillSync,
  randomInt,
  randomUUID,
  subtle,
  timingSafeEqual,
  webcrypto,
};
