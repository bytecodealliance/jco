import * as crypto from "node:crypto";
import { capture, serializeHostError } from "./internal/host-error.js";
export const pbkdf2 = (
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  length: number,
  digest: string,
) =>
  capture(
    () => new Uint8Array(crypto.pbkdf2Sync(password, salt, iterations, length, digest)),
    serializeHostError,
  );
export const hkdf = (
  digest: string,
  key: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number,
) =>
  capture(
    () => new Uint8Array(crypto.hkdfSync(digest, key, salt, info, length)),
    serializeHostError,
  );
export const scrypt = (
  password: Uint8Array,
  salt: Uint8Array,
  length: number,
  cost: number,
  blockSize: number,
  parallelization: number,
  maxmem: number,
) =>
  capture(
    () =>
      new Uint8Array(
        crypto.scryptSync(password, salt, length, {
          N: cost,
          r: blockSize,
          p: parallelization,
          maxmem: Number(maxmem),
        }),
      ),
    serializeHostError,
  );
