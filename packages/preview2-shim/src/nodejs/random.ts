import { randomBytes, randomFillSync } from "node:crypto";
import type {
  insecure as InsecureNamespace,
  insecureSeed as InsecureSeedNamespace,
  random as RandomNamespace,
} from "../../types/random.js";

export const insecure: typeof InsecureNamespace = {
  getInsecureRandomBytes: getRandomBytes,
  getInsecureRandomU64() {
    return new BigUint64Array(randomBytes(8).buffer)[0];
  },
};

let insecureSeedValue1: bigint, insecureSeedValue2: bigint;

export const insecureSeed: typeof InsecureSeedNamespace = {
  insecureSeed(): [bigint, bigint] {
    if (insecureSeedValue1 === undefined) {
      insecureSeedValue1 = random.getRandomU64();
      insecureSeedValue2 = random.getRandomU64();
    }
    return [insecureSeedValue1, insecureSeedValue2];
  },
};

export const random: typeof RandomNamespace = {
  getRandomBytes,
  getRandomU64() {
    return new BigUint64Array(randomBytes(8).buffer)[0];
  },
};

function getRandomBytes(len: bigint | number): Uint8Array {
  return randomBytes(Number(len));
}

getRandomBytes[Symbol.for("cabiLower")] = ({ memory, realloc }: any) => {
  let buf32 = new Uint32Array(memory.buffer);
  return function randomBytesImpl(len: number, retptr: number) {
    len = Number(len);
    const ptr = realloc(0, 0, 1, len);
    randomFillSync(memory.buffer, ptr, len);
    if (memory.buffer !== buf32.buffer) {
      buf32 = new Uint32Array(memory.buffer);
    }
    if (retptr % 4) {
      throw new Error("wasi-io trap: retptr not aligned");
    }
    buf32[retptr >> 2] = ptr;
    buf32[(retptr >> 2) + 1] = len;
  };
};
