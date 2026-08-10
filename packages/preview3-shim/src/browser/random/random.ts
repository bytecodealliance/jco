import { random } from "@bytecodealliance/preview2-shim/random";

function getRandomBytes(maxLen: bigint): Uint8Array {
  return random.getRandomBytes(maxLen);
}

function getRandomU64(): bigint {
  return random.getRandomU64();
}

export default {
  getRandomBytes,
  getRandomU64,
} satisfies typeof import("../../../types/interfaces/wasi-random-random.d.ts");
export type * from "../../../types/interfaces/wasi-random-random.d.ts";
