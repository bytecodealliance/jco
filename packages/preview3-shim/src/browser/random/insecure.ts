import { Todo } from "../../common/errors.js";

function getInsecureRandomBytes(maxLen: bigint): Uint8Array {
  throw new Todo();
}

function getInsecureRandomU64(): bigint {
  throw new Todo();
}

export default {
  getInsecureRandomBytes,
  getInsecureRandomU64,
} satisfies typeof import("../../../types/interfaces/wasi-random-insecure.d.ts");
export type * from "../../../types/interfaces/wasi-random-insecure.d.ts";
