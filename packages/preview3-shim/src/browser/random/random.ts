import { Todo } from "../../common/errors.js";

function getRandomBytes(maxLen: bigint): Uint8Array {
  throw new Todo();
}

function getRandomU64(): bigint {
  throw new Todo();
}

export default {
  getRandomBytes,
  getRandomU64,
} satisfies typeof import("../../../types/interfaces/wasi-random-random.d.ts");
export type * from "../../../types/interfaces/wasi-random-random.d.ts";
