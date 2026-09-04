/**
 * Synchronous message digests.
 *
 * The engine supplies WebCrypto, but `crypto.subtle.digest()` is asynchronous and
 * `crypto.createHash()` is not: `etag` -- which Express calls on the default `res.send()`
 * path -- hashes and returns in one synchronous expression. So the digests that matter for
 * that path are implemented here, from FIPS 180-4, rather than left to a stub that throws
 * the first time an ordinary Express route responds.
 *
 * These are for integrity and cache validators, not for secrets: they run in the guest's
 * JavaScript with no constant-time guarantees. Anything security-sensitive should use
 * `crypto.subtle`, which the engine implements natively.
 */

/** Digest algorithms implemented here, under the names Node accepts. */
export type DigestAlgorithm = "sha1" | "sha256";

/** Byte length of each algorithm's output. */
export const DIGEST_LENGTH: Record<DigestAlgorithm, number> = { sha1: 20, sha256: 32 };

/** Byte length of each algorithm's compression block, which HMAC keys are padded to. */
export const BLOCK_LENGTH: Record<DigestAlgorithm, number> = { sha1: 64, sha256: 64 };

/** Normalize the algorithm spellings Node accepts, or return `undefined` if unknown. */
export function normalizeAlgorithm(algorithm: string): DigestAlgorithm | undefined {
  const normalized = algorithm.toLowerCase().replace(/[-_]/g, "");
  if (normalized === "sha1") {
    return "sha1";
  }
  if (normalized === "sha256") {
    return "sha256";
  }
  return undefined;
}

/**
 * Append the length-suffixed padding both algorithms share.
 *
 * @param message - the message to pad
 * @returns the message followed by `0x80`, zero padding, and its bit length
 */
function padMessage(message: Uint8Array): Uint8Array {
  const bitLength = BigInt(message.length) * 8n;
  const paddedLength = (((message.length + 8) >> 6) + 1) << 6;
  const padded = new Uint8Array(paddedLength);
  padded.set(message);
  padded[message.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setBigUint64(paddedLength - 8, bitLength, false);
  return padded;
}

function rotateLeft(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

function rotateRight(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

/** SHA-1, per FIPS 180-4 section 6.1.2. */
export function sha1(message: Uint8Array): Uint8Array {
  const padded = padMessage(message);
  const view = new DataView(padded.buffer);
  let [h0, h1, h2, h3, h4] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const w = new Uint32Array(80);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 80; i += 1) {
      w[i] = rotateLeft(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    }

    let [a, b, c, d, e] = [h0, h1, h2, h3, h4];
    for (let i = 0; i < 80; i += 1) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (rotateLeft(a, 5) + f + e + k + w[i]) >>> 0;
      e = d;
      d = c;
      c = rotateLeft(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const digest = new Uint8Array(20);
  const digestView = new DataView(digest.buffer);
  [h0, h1, h2, h3, h4].forEach((word, index) => digestView.setUint32(index * 4, word, false));
  return digest;
}

/** Round constants for SHA-256, per FIPS 180-4 section 4.2.2. */
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** SHA-256, per FIPS 180-4 section 6.2.2. */
export function sha256(message: Uint8Array): Uint8Array {
  const padded = padMessage(message);
  const view = new DataView(padded.buffer);
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotateRight(w[i - 15], 7) ^ rotateRight(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotateRight(w[i - 2], 17) ^ rotateRight(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i += 1) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + s1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }

  const digest = new Uint8Array(32);
  const digestView = new DataView(digest.buffer);
  h.forEach((word, index) => digestView.setUint32(index * 4, word, false));
  return digest;
}

/** Run one of the implemented digests over a message. */
export function digest(algorithm: DigestAlgorithm, message: Uint8Array): Uint8Array {
  return algorithm === "sha1" ? sha1(message) : sha256(message);
}
