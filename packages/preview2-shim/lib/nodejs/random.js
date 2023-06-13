import { randomBytes } from "node:crypto";

let insecureRandomValue1, insecureRandomValue2;

export const randomRandom = {
  getRandomBytes(len) {
    return randomBytes(Number(len));
  },

  getRandomU64 () {
    return new BigUint64Array(randomBytes(8).buffer)[0];
  },

  insecureRandom () {
    if (insecureRandomValue1 === undefined) {
      insecureRandomValue1 = randomRandom.getRandomU64();
      insecureRandomValue2 = randomRandom.getRandomU64();
    }
    return [insecureRandomValue1, insecureRandomValue2];
  }
};

export { randomRandom as random }
