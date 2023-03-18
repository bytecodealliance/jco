export namespace Random {
  export function getRandomBytes(len: bigint): Uint8Array | ArrayBuffer;
  export function getRandomU64(): bigint;
  export function insecureRandom(): [bigint, bigint];
}
