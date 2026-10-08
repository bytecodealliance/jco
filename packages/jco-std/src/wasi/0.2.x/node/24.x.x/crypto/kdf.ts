import { Buffer } from "node:buffer";
import { sha1 } from "@noble/hashes/sha1";
import { sha256, sha384, sha512 } from "@noble/hashes/sha2";
import { pbkdf2 as derivePbkdf2 } from "@noble/hashes/pbkdf2";
import { hkdf as deriveHkdf } from "@noble/hashes/hkdf";
import { scrypt as deriveScrypt, scryptAsync } from "@noble/hashes/scrypt";
import { invalidArgType, outOfRange } from "../errors/core.js";
import { normalizeAlgorithm } from "./digest.js";
import { unsupportedAlgorithm } from "./errors.js";
import { toBytes } from "./hash.js";
import { derivationHost, derive } from "./kdf-host.js";

type Callback = (error: Error | null, key?: Buffer | ArrayBuffer) => void;
const hashes = { sha1, sha256, sha384, sha512 };

function algorithm(value: string) {
  if (typeof value !== "string") {
    throw invalidArgType("digest", "string", value);
  }
  const name = normalizeAlgorithm(value);
  if (!name) {
    throw unsupportedAlgorithm(value);
  }
  return hashes[name];
}

function integer(value: number, name: string, min: number, max = 0x7fffffff): number {
  if (typeof value !== "number") {
    throw invalidArgType(name, "number", value);
  }
  if (!Number.isInteger(value) || value < min || value > max) {
    throw outOfRange(name, `>= ${min} && <= ${max}`, value);
  }
  return value;
}

function callback(value: Callback): Callback {
  if (typeof value !== "function") {
    throw invalidArgType("callback", "Function", value);
  }
  return value;
}

export function pbkdf2Sync(
  password: unknown,
  salt: unknown,
  iterations: number,
  keylen: number,
  digest: string,
): Buffer {
  const hash = algorithm(digest);
  integer(iterations, "iterations", 1);
  integer(keylen, "keylen", 0);
  const host = derivationHost();
  return Buffer.from(
    host
      ? derive(() => host.pbkdf2(toBytes(password), toBytes(salt), iterations, keylen, digest))
      : derivePbkdf2(hash, toBytes(password), toBytes(salt), { c: iterations, dkLen: keylen }),
  );
}

export function pbkdf2(
  password: unknown,
  salt: unknown,
  iterations: number,
  keylen: number,
  digest: string,
  done: Callback,
): void {
  callback(done);
  const hash = algorithm(digest);
  integer(iterations, "iterations", 1);
  integer(keylen, "keylen", 0);
  const passwordBytes = toBytes(password),
    saltBytes = toBytes(salt);
  queueMicrotask(() => {
    let key: Buffer;
    try {
      const host = derivationHost();
      key = Buffer.from(
        host
          ? derive(() => host.pbkdf2(passwordBytes, saltBytes, iterations, keylen, digest))
          : derivePbkdf2(hash, passwordBytes, saltBytes, { c: iterations, dkLen: keylen }),
      );
    } catch (error) {
      done(error as Error);
      return;
    }
    done(null, key);
  });
}

export function hkdfSync(
  digest: string,
  ikm: unknown,
  salt: unknown,
  info: unknown,
  keylen: number,
): ArrayBuffer {
  const hash = algorithm(digest);
  integer(keylen, "keylen", 0, 255 * hash.outputLen);
  const host = derivationHost();
  const bytes = host
    ? derive(() => host.hkdf(digest, toBytes(ikm), toBytes(salt), toBytes(info), keylen))
    : deriveHkdf(hash, toBytes(ikm), toBytes(salt), toBytes(info), keylen);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function hkdf(
  digest: string,
  ikm: unknown,
  salt: unknown,
  info: unknown,
  keylen: number,
  done: Callback,
): void {
  callback(done);
  const key = hkdfSync(digest, ikm, salt, info, keylen);
  queueMicrotask(() => done(null, key));
}

export interface ScryptOptions {
  N?: number;
  cost?: number;
  r?: number;
  blockSize?: number;
  p?: number;
  parallelization?: number;
  maxmem?: number;
}

function scryptOptions(keylen: number, options: ScryptOptions = {}) {
  const N = options.N ?? options.cost ?? 16384;
  const r = options.r ?? options.blockSize ?? 8;
  const p = options.p ?? options.parallelization ?? 1;
  const maxmem = options.maxmem ?? 32 * 1024 * 1024;
  integer(keylen, "keylen", 0);
  integer(N, "N", 0, 0xffffffff);
  integer(r, "r", 0, 0xffffffff);
  integer(p, "p", 0, 0xffffffff);
  integer(maxmem, "maxmem", 0, Number.MAX_SAFE_INTEGER);
  if (N < 2 || (N & (N - 1)) !== 0 || r < 1 || p < 1 || 128 * r * (N + p + 2) > maxmem) {
    throw Object.assign(new RangeError("Invalid scrypt params"), {
      code: "ERR_CRYPTO_INVALID_SCRYPT_PARAMS",
    });
  }
  return { N, r, p, maxmem, dkLen: keylen };
}

export function scryptSync(
  password: unknown,
  salt: unknown,
  keylen: number,
  options?: ScryptOptions,
): Buffer {
  const params = scryptOptions(keylen, options),
    host = derivationHost();
  return Buffer.from(
    host
      ? derive(() =>
          host.scrypt(
            toBytes(password),
            toBytes(salt),
            keylen,
            params.N,
            params.r,
            params.p,
            params.maxmem,
          ),
        )
      : deriveScrypt(toBytes(password), toBytes(salt), params),
  );
}

export function scrypt(
  password: unknown,
  salt: unknown,
  keylen: number,
  options: ScryptOptions | Callback,
  done?: Callback,
): void {
  const cb = callback(typeof options === "function" ? options : done!);
  const params = scryptOptions(keylen, typeof options === "function" ? undefined : options);
  void scryptAsync(toBytes(password), toBytes(salt), params).then(
    (key) => cb(null, Buffer.from(key)),
    (error) => cb(error),
  );
}
