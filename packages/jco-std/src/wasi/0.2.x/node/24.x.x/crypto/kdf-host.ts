import { callHost } from "../internal/host-error.js";
export interface KdfHost {
  pbkdf2(
    password: Uint8Array,
    salt: Uint8Array,
    iterations: number,
    length: number,
    digest: string,
  ): Uint8Array;
  hkdf(
    digest: string,
    key: Uint8Array,
    salt: Uint8Array,
    info: Uint8Array,
    length: number,
  ): Uint8Array;
  scrypt(
    password: Uint8Array,
    salt: Uint8Array,
    length: number,
    cost: number,
    blockSize: number,
    parallelization: number,
    maxmem: number,
  ): Uint8Array;
}
let host: KdfHost | undefined;
export function setDerivationHost(provider: KdfHost): void {
  host = provider;
}
export function derivationHost(): KdfHost | undefined {
  return host;
}
export function derive<T>(operation: () => T): T {
  return callHost(operation, (error) => Object.assign(new Error(error.message), error));
}
