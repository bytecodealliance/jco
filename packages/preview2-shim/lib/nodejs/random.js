import { randomBytes } from "node:crypto";

export const insecure = {
  getInsecureRandomBytes (len) {
    return randomBytes(Number(len));
  },
  getInsecureRandomU64 () {
    return new BigUint64Array(randomBytes(8).buffer)[0];
  }
};

let insecureSeedValue1, insecureSeedValue2;

export const insecureSeed = {
  insecureSeed () {
    if (insecureSeedValue1 === undefined) {
      insecureSeedValue1 = random.getRandomU64();
      insecureSeedValue2 = random.getRandomU64();
    }
    return [insecureSeedValue1, insecureSeedValue2];
  }
};

export const random = {
  getRandomBytes(len) {
    return randomBytes(Number(len));
  },

  getRandomU64 () {
    return new BigUint64Array(randomBytes(8).buffer)[0];
  }
};
