import { insecure } from "@bytecodealliance/preview2-shim/random";

function getInsecureRandomBytes(maxLen: bigint): Uint8Array {
  return insecure.getInsecureRandomBytes(maxLen);
}

function getInsecureRandomU64(): bigint {
  return insecure.getInsecureRandomU64();
}

export default {
  getInsecureRandomBytes,
  getInsecureRandomU64,
} satisfies typeof import("../../../types/interfaces/wasi-random-insecure.d.ts");
export type * from "../../../types/interfaces/wasi-random-insecure.d.ts";
