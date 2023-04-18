import { randomBytes } from "node:crypto";

export function getRandomBytes(len) {
  return randomBytes(Number(len));
}

export function getRandomU64 () {
  return new BigUint64Array(randomBytes(8).buffer)[0];
}

let insecureRandomValue1, insecureRandomValue2;
export function insecureRandom () {
  if (insecureRandomValue1 === undefined) {
    insecureRandomValue1 = getRandomU64();
    insecureRandomValue2 = getRandomU64();
  }
  return [insecureRandomValue1, insecureRandomValue2];
}
